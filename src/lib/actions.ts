import { printHeader, printSuccess, printError, printInfo, printWarning, handleError, formatTime } from './utils';
import {
  loadDeployConfig,
  getProjectPaths,
  getSSHConfig,
  printConfigSummary,
  getDockerComposeServiceName,
  normalizeServiceName,
  validateService,
  isServiceActive,
  getActiveServices,
  type Environment,
  type DeployConfig,
} from './config';
import {
  dockerComposePull,
  dockerComposeUp,
  checkContainersExist,
  printContainerStatus,
} from './docker';
import {
  createRemoteDirectory,
  syncBackendFolder,
  syncSharedFolder,
  syncRootFiles,
  installRemoteDependencies,
  executeRemoteCommand,
  type WorkspaceFilter,
} from './ssh';
import { runMigrations, printMigrationInfo } from './prisma';
import { runPreDeployValidations, confirmProductionDeploy } from './validation';
import { runHealthCheck, waitForContainers } from './health-check';
import {
  saveDeployment,
  updateDeploymentStatus,
  getCurrentCommitHash,
  type DeploymentType,
} from './history';

/**
 * Genera workspace filters dinamicamente basado en la configuracion
 * Cada proyecto puede tener diferente estructura de workspaces
 */
function getWorkspaceFilters(config: DeployConfig): {
  backend: WorkspaceFilter;
  frontend: WorkspaceFilter;
  full: WorkspaceFilter;
} {
  // Obtener workspaces desde paths de la config o usar defaults
  const paths = config.paths || {};

  const backendPath = paths.backend || 'packages/backend';
  const frontendPath = paths.frontend || 'packages/frontend';
  const sharedPath = paths.shared || 'packages/shared';

  // Para backend, incluir API y todos los workers activos
  const backendWorkspaces = [`${backendPath}/api`, sharedPath];

  // Agregar workers activos como workspaces
  const activeServices = getActiveServices(config);
  for (const service of activeServices) {
    if (service !== 'api' && service.includes('worker')) {
      // Convertir snake_case a path (pdf_worker -> pdf-worker)
      const workerPath = service.replace(/_/g, '-');
      backendWorkspaces.push(`${backendPath}/${workerPath}`);
    }
  }

  return {
    backend: {
      include: backendWorkspaces,
    },
    frontend: {
      include: [frontendPath, sharedPath],
    },
    full: {
      include: [frontendPath, `${backendPath}/api`, sharedPath, ...backendWorkspaces.filter(w => !w.includes('/api'))],
    },
  };
}

/**
 * Opciones comunes para deploy
 */
export interface DeployOptions {
  env?: Environment;
  skipMigrations?: boolean;
  skipHealthCheck?: boolean;
  skipValidations?: boolean;
}

/**
 * Deploy completo (backend + frontend)
 */
export async function deployAll(options: DeployOptions = {}): Promise<void> {
  const startTime = new Date();

  printHeader('DEPLOY COMPLETO - BACKEND + FRONTEND');

  const config = loadDeployConfig();
  const paths = getProjectPaths(config);
  const environment = options.env || 'production';

  // Confirmacion para produccion
  if (environment === 'production') {
    const confirmed = await confirmProductionDeploy();
    if (!confirmed) {
      return;
    }
  }

  // Crear registro de deployment
  const commitHash = await getCurrentCommitHash();
  const deploymentId = saveDeployment({
    environment,
    type: 'full',
    commitHash,
    status: 'in_progress',
  });

  try {
    // Validaciones pre-deploy
    if (!options.skipValidations) {
      const validation = await runPreDeployValidations(config, {
        environment,
        deployType: 'full',
      });

      if (!validation.passed) {
        updateDeploymentStatus(deploymentId, 'failed', undefined, 'Pre-deploy validation failed');
        printError('Deployment cancelled due to validation failures');
        return;
      }
    }

    // Mostrar configuracion
    printConfigSummary(config);

    // Deploy backend
    await deployBackend({ ...options, skipValidations: true });

    // TODO: Deploy frontend (futuro)
    printInfo('Frontend deployment not yet implemented');

    // Health check final
    if (!options.skipHealthCheck) {
      printHeader('STEP: FINAL HEALTH CHECK');

      const sshConfig = getSSHConfig(config);

      const healthy = await runHealthCheck(config, {
        remote: sshConfig
          ? {
              path: config.deployment.path,
              ssh: {
                target: sshConfig.target,
                sshKey: config.deployment.ssh_key,
              },
            }
          : undefined,
      });

      if (!healthy) {
        printWarning('Some services are not healthy');
      }
    }

    const duration = Math.floor((new Date().getTime() - startTime.getTime()) / 1000);
    updateDeploymentStatus(deploymentId, 'success', duration);

    printHeader('DEPLOYMENT COMPLETE');
    printSuccess(`Deployment finished in ${formatTime(startTime)}`);
    printInfo(`Deployment ID: #${deploymentId}`);
  } catch (error) {
    const duration = Math.floor((new Date().getTime() - startTime.getTime()) / 1000);
    updateDeploymentStatus(deploymentId, 'failed', duration, String(error));

    printError('Deployment failed');
    handleError(error, 'deployAll');
  }
}

/**
 * Deploy solo backend (API + Workers)
 */
export async function deployBackend(options: DeployOptions = {}): Promise<void> {
  const startTime = new Date();

  printHeader('DEPLOY BACKEND - API + WORKERS');

  const config = loadDeployConfig();
  const paths = getProjectPaths(config);
  const environment = options.env || 'production';

  // Confirmacion para produccion (si no viene de deployAll)
  if (environment === 'production' && !options.skipValidations) {
    const confirmed = await confirmProductionDeploy();
    if (!confirmed) {
      return;
    }
  }

  const commitHash = await getCurrentCommitHash();
  const deploymentId = saveDeployment({
    environment,
    type: 'backend',
    commitHash,
    status: 'in_progress',
  });

  try {
    // Validaciones (si no se han hecho ya)
    if (!options.skipValidations) {
      const validation = await runPreDeployValidations(config, {
        environment,
        deployType: 'backend',
      });

      if (!validation.passed) {
        updateDeploymentStatus(deploymentId, 'failed', undefined, 'Pre-deploy validation failed');
        return;
      }

      printConfigSummary(config);
    }

    if (config.deployment.type === 'remote') {
      await deployBackendRemote(config, paths, options);
    } else {
      await deployBackendLocal(config, paths, options);
    }

    const duration = Math.floor((new Date().getTime() - startTime.getTime()) / 1000);
    updateDeploymentStatus(deploymentId, 'success', duration);

    printSuccess(`Backend deployment finished in ${formatTime(startTime)}`);
    printInfo(`Deployment ID: #${deploymentId}`);
  } catch (error) {
    const duration = Math.floor((new Date().getTime() - startTime.getTime()) / 1000);
    updateDeploymentStatus(deploymentId, 'failed', duration, String(error));

    printError('Backend deployment failed');
    throw error;
  }
}

/**
 * Deploy backend remoto (VPS)
 */
async function deployBackendRemote(
  config: DeployConfig,
  paths: any,
  options: DeployOptions
): Promise<void> {
  printHeader('STEP 1: SYNC FILES TO VPS');

  const sshConfig = getSSHConfig(config);

  if (!sshConfig) {
    throw new Error('SSH configuration not available');
  }

  const sshOptions = {
    target: sshConfig.target,
    sshKey: config.deployment.ssh_key,
  };

  // Crear directorios remotos
  await createRemoteDirectory(config.deployment.path, sshOptions);
  await createRemoteDirectory(`${config.deployment.path}/packages`, sshOptions);
  await createRemoteDirectory(`${config.deployment.path}/packages/backend`, sshOptions);
  await createRemoteDirectory(`${config.deployment.path}/packages/shared`, sshOptions);

  // Obtener workspace filters dinamicos
  const workspaceFilters = getWorkspaceFilters(config);

  // Sync root files with workspace filtering
  await syncRootFiles(
    paths.root,
    config.deployment.path,
    sshOptions,
    workspaceFilters.backend
  );

  // Sync backend folder
  await syncBackendFolder(paths.root, config.deployment.path, sshOptions);

  // Sync shared folder
  await syncSharedFolder(paths.root, config.deployment.path, sshOptions);

  printHeader('STEP 2: BUILD & START DOCKER STACK');

  // Check if containers exist on remote VPS
  printInfo('Checking for existing containers...');
  const checkResult = await executeRemoteCommand(
    `cd ${config.deployment.path}/packages/backend && docker compose ps -q`,
    sshOptions
  );

  const containerCount = checkResult.stdout.trim().split('\n').filter(line => line.length > 0).length;
  printInfo(`Found ${containerCount} existing container(s)`);

  // Pull images
  printInfo('Pulling Docker images...');
  await executeRemoteCommand(
    `cd ${config.deployment.path}/packages/backend && docker compose pull`,
    sshOptions
  );

  // Up containers
  const dockerCmd =
    containerCount > 0
      ? 'docker compose up -d --build --force-recreate'
      : 'docker compose up -d --build';

  printInfo(`Executing: ${dockerCmd}`);

  await executeRemoteCommand(
    `cd ${config.deployment.path}/packages/backend && ${dockerCmd}`,
    sshOptions
  );

  printSuccess('Docker stack updated');

  printHeader('STEP 3: WAIT FOR CONTAINERS');

  // Wait for containers
  await waitForContainers({
    remote: {
      path: config.deployment.path,
      ssh: sshOptions,
    },
  });

  // Health check
  if (!options.skipHealthCheck) {
    printHeader('STEP 4: HEALTH CHECK');

    await runHealthCheck(config, {
      remote: {
        path: config.deployment.path,
        ssh: sshOptions,
      },
    });
  }
}

/**
 * Deploy backend local
 */
async function deployBackendLocal(
  config: DeployConfig,
  paths: any,
  options: DeployOptions
): Promise<void> {
  printHeader('LOCAL BACKEND DEPLOYMENT');

  const backendPath = paths.backend;

  printHeader('STEP 1: START/UPDATE DOCKER STACK');

  // Check if containers exist
  const containerCount = await checkContainersExist({
    cwd: backendPath,
  });

  // Pull images
  await dockerComposePull({
    cwd: backendPath,
  });

  // Up containers
  await dockerComposeUp({
    cwd: backendPath,
    build: true,
    detached: true,
    forceRecreate: containerCount > 0,
  });

  // Wait for containers
  await waitForContainers();

  // Health check
  if (!options.skipHealthCheck) {
    printHeader('STEP 2: HEALTH CHECK');

    await runHealthCheck(config);
  }
}

/**
 * Deploy solo frontend
 */
export async function deployFrontend(options: DeployOptions = {}): Promise<void> {
  printHeader('DEPLOY FRONTEND');

  printWarning('Frontend deployment not yet implemented');
  printInfo('This feature will be added in a future version');

  // TODO: Implementar deploy de frontend
  // - Build de Next.js
  // - Deploy a Vercel/Netlify/VPS
  // - Invalidar cache de CDN
}

/**
 * Deploy de un servicio especifico
 */
export async function deployService(
  serviceName: string,
  options: DeployOptions = {}
): Promise<void> {
  const startTime = new Date();

  printHeader(`DEPLOY SERVICE: ${serviceName.toUpperCase()}`);

  const config = loadDeployConfig();
  const paths = getProjectPaths(config);
  const environment = options.env || 'production';

  // Normalize service name
  const normalizedService = normalizeServiceName(serviceName);

  // Validar que el servicio existe en la configuracion
  if (!validateService(config, normalizedService)) {
    printError(`Invalid service name: ${serviceName}`);
    const activeServices = getActiveServices(config);
    printInfo(`Valid services: ${activeServices.join(', ')}`);
    return;
  }

  // Check if service is active
  if (!isServiceActive(config, normalizedService)) {
    printWarning(`Service '${normalizedService}' is not active in configuration`);

    const { confirm } = await import('./utils');
    const proceed = await confirm('Deploy anyway?', false);

    if (!proceed) {
      return;
    }
  }

  const commitHash = await getCurrentCommitHash();
  const deploymentId = saveDeployment({
    environment,
    type: 'service',
    service: normalizedService,
    commitHash,
    status: 'in_progress',
  });

  try {
    // Validaciones basicas
    if (!options.skipValidations) {
      const validation = await runPreDeployValidations(config, {
        environment,
        deployType: 'backend',
        skipGit: false,
      });

      if (!validation.passed) {
        updateDeploymentStatus(deploymentId, 'failed', undefined, 'Validation failed');
        return;
      }
    }

    if (config.deployment.type === 'remote') {
      await deployServiceRemote(normalizedService, config, paths, options);
    } else {
      await deployServiceLocal(normalizedService, config, paths, options);
    }

    const duration = Math.floor((new Date().getTime() - startTime.getTime()) / 1000);
    updateDeploymentStatus(deploymentId, 'success', duration);

    printSuccess(`Service '${normalizedService}' deployed in ${formatTime(startTime)}`);
    printInfo(`Deployment ID: #${deploymentId}`);
  } catch (error) {
    const duration = Math.floor((new Date().getTime() - startTime.getTime()) / 1000);
    updateDeploymentStatus(deploymentId, 'failed', duration, String(error));

    printError(`Service deployment failed: ${normalizedService}`);
    throw error;
  }
}

/**
 * Deploy servicio remoto
 */
async function deployServiceRemote(
  serviceName: string,
  config: DeployConfig,
  paths: any,
  options: DeployOptions
): Promise<void> {
  const sshConfig = getSSHConfig(config);

  if (!sshConfig) {
    throw new Error('SSH configuration not available');
  }

  const sshOptions = {
    target: sshConfig.target,
    sshKey: config.deployment.ssh_key,
  };

  printInfo(`Deploying service '${serviceName}' to remote VPS...`);

  // Obtener workspace filters dinamicos
  const workspaceFilters = getWorkspaceFilters(config);

  // Sync root files (package.json, bun.lock) with workspace filtering
  await syncRootFiles(
    paths.root,
    config.deployment.path,
    sshOptions,
    workspaceFilters.backend
  );

  // Sync backend folder
  await syncBackendFolder(paths.root, config.deployment.path, sshOptions);

  // Sync shared folder
  await syncSharedFolder(paths.root, config.deployment.path, sshOptions);

  // Install dependencies
  await installRemoteDependencies(config.deployment.path, sshOptions);

  // Deploy only this service
  const dockerServiceName = getDockerComposeServiceName(config, serviceName);

  printInfo(`Redeploying service: ${serviceName} (docker: ${dockerServiceName})`);

  await executeRemoteCommand(
    `cd ${config.deployment.path}/packages/backend && docker compose up -d --no-deps --build ${dockerServiceName}`,
    sshOptions
  );

  printSuccess(`Service '${serviceName}' deployed`);

  // Wait and health check
  await waitForContainers({
    remote: {
      path: config.deployment.path,
      ssh: sshOptions,
    },
  });

  if (!options.skipHealthCheck) {
    await runHealthCheck(config, {
      remote: {
        path: config.deployment.path,
        ssh: sshOptions,
      },
    });
  }
}

/**
 * Deploy servicio local
 */
async function deployServiceLocal(
  serviceName: string,
  config: DeployConfig,
  paths: any,
  options: DeployOptions
): Promise<void> {
  // Obtener el nombre real del servicio en docker-compose
  const dockerServiceName = getDockerComposeServiceName(config, serviceName);

  printInfo(`Deploying service '${serviceName}' (docker: ${dockerServiceName}) locally...`);

  await dockerComposeUp({
    cwd: paths.backend,
    service: dockerServiceName,
    build: true,
    detached: true,
    noDeps: true,
  });

  printSuccess(`Service '${serviceName}' deployed`);

  await waitForContainers();

  if (!options.skipHealthCheck) {
    await runHealthCheck(config);
  }
}
