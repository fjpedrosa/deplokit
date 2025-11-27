import { execa } from 'execa';
import ora from 'ora';
import { printError, printSuccess, printInfo, printWarning, colors, printTable, sleep } from './utils';
import { getContainerStatus, getContainerLogs, type ContainerStatus } from './docker';
import type { DeployConfig } from './config';
import { getDockerComposeServiceName, getActiveServices } from './config';
import { executeRemoteCommand, type SSHOptions } from './ssh';

/**
 * Resultado de health check
 */
export interface HealthCheckResult {
  service: string;
  healthy: boolean;
  message: string;
  details?: string;
}

/**
 * Opciones para health check
 */
export interface HealthCheckOptions {
  remote?: {
    path: string;
    ssh: SSHOptions;
  };
  timeout?: number;
  retries?: number;
}

/**
 * Verifica la salud de un contenedor Docker
 */
async function checkContainerHealth(
  containerName: string,
  options: HealthCheckOptions = {}
): Promise<HealthCheckResult> {
  const { remote, timeout = 30000 } = options;

  try {
    let containerInfo: string;

    if (remote) {
      const command = `cd ${remote.path}/packages/backend && docker inspect ${containerName} --format='{{.State.Health.Status}} {{.State.Status}}'`;
      const result = await executeRemoteCommand(command, remote.ssh);
      containerInfo = result.stdout.trim();
    } else {
      const { stdout } = await execa('docker', [
        'inspect',
        containerName,
        '--format={{.State.Health.Status}} {{.State.Status}}',
      ]);
      containerInfo = stdout.trim();
    }

    const [healthStatus, runningStatus] = containerInfo.split(' ');

    if (runningStatus !== 'running') {
      return {
        service: containerName,
        healthy: false,
        message: `Container is ${runningStatus}`,
      };
    }

    if (healthStatus === 'healthy' || healthStatus === '') {
      return {
        service: containerName,
        healthy: true,
        message: 'Healthy',
      };
    }

    return {
      service: containerName,
      healthy: false,
      message: `Health status: ${healthStatus}`,
    };
  } catch (error: any) {
    return {
      service: containerName,
      healthy: false,
      message: 'Could not check health',
      details: error.message,
    };
  }
}

/**
 * Verifica endpoint HTTP
 */
async function checkHTTPEndpoint(
  url: string,
  expectedStatus: number = 200,
  timeout: number = 10000
): Promise<HealthCheckResult> {
  try {
    const response = await fetch(url, {
      method: 'GET',
      signal: AbortSignal.timeout(timeout),
    });

    if (response.status === expectedStatus) {
      return {
        service: url,
        healthy: true,
        message: `HTTP ${response.status}`,
      };
    }

    return {
      service: url,
      healthy: false,
      message: `HTTP ${response.status} (expected ${expectedStatus})`,
    };
  } catch (error: any) {
    return {
      service: url,
      healthy: false,
      message: 'Request failed',
      details: error.message,
    };
  }
}

/**
 * Verifica el health status real de un contenedor usando docker inspect
 */
async function checkContainerActualHealth(
  containerName: string,
  serviceName: string,
  options: HealthCheckOptions = {}
): Promise<HealthCheckResult> {
  const { remote } = options;

  try {
    let healthInfo: string;

    if (remote) {
      const command = `docker inspect ${containerName} --format='{{.State.Health.Status}}|{{.State.Status}}|{{.State.Running}}'`;
      const result = await executeRemoteCommand(command, remote.ssh);
      healthInfo = result.stdout.trim();
    } else {
      const { stdout } = await execa('docker', [
        'inspect',
        containerName,
        '--format={{.State.Health.Status}}|{{.State.Status}}|{{.State.Running}}',
      ]);
      healthInfo = stdout.trim();
    }

    const [healthStatus, state, running] = healthInfo.split('|');

    // Si el contenedor no tiene healthcheck configurado, healthStatus sera vacio o '<no value>'
    if (!healthStatus || healthStatus === '<no value>') {
      // Sin healthcheck - solo verificar que este running
      if (running === 'true' && state === 'running') {
        return {
          service: serviceName,
          healthy: true,
          message: 'Running',
          details: 'No healthcheck configured',
        };
      } else {
        return {
          service: serviceName,
          healthy: false,
          message: `State: ${state}`,
          details: running === 'true' ? 'Running but not healthy' : 'Not running',
        };
      }
    }

    // Con healthcheck configurado
    if (healthStatus === 'healthy') {
      return {
        service: serviceName,
        healthy: true,
        message: 'Healthy',
        details: 'Container and healthcheck OK',
      };
    } else if (healthStatus === 'starting') {
      return {
        service: serviceName,
        healthy: false,
        message: 'Starting',
        details: 'Healthcheck in start_period',
      };
    } else {
      // unhealthy
      return {
        service: serviceName,
        healthy: false,
        message: 'Unhealthy',
        details: `Health status: ${healthStatus}`,
      };
    }
  } catch (error: any) {
    return {
      service: serviceName,
      healthy: false,
      message: 'Could not check health',
      details: error.message,
    };
  }
}

/**
 * Verifica servicios backend
 */
export async function checkBackendServices(
  config: DeployConfig,
  options: HealthCheckOptions = {}
): Promise<HealthCheckResult[]> {
  printInfo('Running health checks on backend services...');
  console.log('');

  const results: HealthCheckResult[] = [];
  const { remote } = options;

  // Get container status
  let containers: ContainerStatus[] = [];

  if (remote) {
    const command = `cd ${remote.path}/packages/backend && docker compose ps --format '{{.Name}}|{{.State}}|{{.Status}}|{{.Service}}'`;
    const result = await executeRemoteCommand(command, remote.ssh);

    if (result.stdout.trim()) {
      containers = result.stdout
        .trim()
        .split('\n')
        .map(line => {
          const [name, state, status, service] = line.split('|');
          return { name, state, status, service };
        });
    }
  } else {
    containers = await getContainerStatus({ cwd: './packages/backend' });
  }

  if (containers.length === 0) {
    printWarning('No containers found');
    return [];
  }

  // Filter containers to only include those from this project
  const projectName = config.project.name;
  const projectContainers = containers.filter(
    c => c.service.startsWith(`${projectName}-`) || c.name.startsWith(`${projectName}-`)
  );

  if (projectContainers.length === 0) {
    printWarning(`No containers found for project "${projectName}"`);
    printInfo(`Found ${containers.length} container(s) from other projects (ignored)`);
    return [];
  }

  // Check each active service - use dynamic service detection
  const activeServices = getActiveServices(config);

  for (const serviceName of activeServices) {
    // Obtener el nombre real del servicio en docker-compose
    const dockerServiceName = getDockerComposeServiceName(config, serviceName);

    // Buscar el contenedor por el nombre de docker-compose (solo en contenedores del proyecto)
    const container = projectContainers.find(
      c => c.service === dockerServiceName ||
           c.service === serviceName ||
           c.service.includes(serviceName) ||
           c.service.includes(dockerServiceName)
    );

    if (!container) {
      results.push({
        service: dockerServiceName,  // Mostrar nombre esperado del servicio
        healthy: false,
        message: `Container not found`,
        details: `Config service: ${serviceName}`,
      });
      continue;
    }

    // Check if running
    if (container.state !== 'running') {
      results.push({
        service: container.service,  // Mostrar nombre real del servicio
        healthy: false,
        message: `State: ${container.state}`,
        details: container.status,
      });

      // Show logs for failed containers
      if (!remote) {
        const logs = await getContainerLogs(container.name, { tail: 20 });
        if (logs) {
          printError(`Logs for ${container.service}:`);
          console.log(colors.gray(logs.split('\n').slice(-10).join('\n')));
        }
      }

      continue;
    }

    // Container is running - check actual health status
    const healthStatus = await checkContainerActualHealth(container.name, container.service, options);

    results.push({
      service: container.service,  // Mostrar nombre real del servicio
      healthy: healthStatus.healthy,
      message: healthStatus.message,
      details: healthStatus.details,
    });
  }

  return results;
}

/**
 * Verifica endpoints de API
 */
export async function checkAPIEndpoints(
  baseUrl: string,
  endpoints: Array<{ path: string; expectedStatus?: number }> = []
): Promise<HealthCheckResult[]> {
  printInfo('Checking API endpoints...');
  console.log('');

  const defaultEndpoints = [
    { path: '/health', expectedStatus: 200 },
    { path: '/api/health', expectedStatus: 200 },
    ...endpoints,
  ];

  const results: HealthCheckResult[] = [];

  for (const endpoint of defaultEndpoints) {
    const url = `${baseUrl}${endpoint.path}`;
    const result = await checkHTTPEndpoint(url, endpoint.expectedStatus);
    results.push(result);
  }

  return results;
}

/**
 * Espera a que los contenedores esten listos
 */
export async function waitForContainers(
  options: HealthCheckOptions & { maxWaitTime?: number; config?: DeployConfig } = {}
): Promise<void> {
  const { maxWaitTime = 60000, remote, config } = options;
  const spinner = ora('Waiting for containers to be ready...').start();

  const startTime = Date.now();
  let allReady = false;

  while (Date.now() - startTime < maxWaitTime && !allReady) {
    let containers: ContainerStatus[] = [];

    if (remote) {
      const command = `cd ${remote.path}/packages/backend && docker compose ps --format '{{.Name}}|{{.State}}|{{.Status}}|{{.Service}}'`;
      const result = await executeRemoteCommand(command, remote.ssh);

      if (result.stdout.trim()) {
        containers = result.stdout
          .trim()
          .split('\n')
          .map(line => {
            const [name, state, status, service] = line.split('|');
            return { name, state, status, service };
          });
      }
    } else {
      containers = await getContainerStatus({ cwd: './packages/backend' });
    }

    if (containers.length === 0) {
      await sleep(2000);
      continue;
    }

    // Filter to only include containers from this project (if config provided)
    if (config) {
      const projectName = config.project.name;
      containers = containers.filter(
        c => c.service.startsWith(`${projectName}-`) || c.name.startsWith(`${projectName}-`)
      );
    }

    if (containers.length === 0) {
      await sleep(2000);
      continue;
    }

    // Check if all are running
    const runningCount = containers.filter(c => c.state === 'running').length;
    const restartingCount = containers.filter(c => c.status.includes('Restarting')).length;

    if (restartingCount > 0) {
      spinner.text = `Waiting... (${restartingCount} container(s) restarting)`;
      await sleep(3000);
      continue;
    }

    if (runningCount === containers.length) {
      allReady = true;
      break;
    }

    spinner.text = `Waiting... (${runningCount}/${containers.length} running)`;
    await sleep(2000);
  }

  if (allReady) {
    spinner.succeed('All containers are ready');
  } else {
    spinner.warn('Timeout waiting for containers');
  }
}

/**
 * Health check completo
 */
export async function runHealthCheck(
  config: DeployConfig,
  options: HealthCheckOptions = {}
): Promise<boolean> {
  console.log('');
  printInfo('Running health checks...');
  console.log('');

  // Wait for containers
  await waitForContainers({ ...options, config });

  // Check backend services
  const backendResults = await checkBackendServices(config, options);

  // Print results
  if (backendResults.length > 0) {
    console.log('');
    printInfo('Service Health Status:');
    console.log('');

    const headers = ['Service', 'Status', 'Message', 'Details'];
    const rows = backendResults.map(r => [
      r.service,
      r.healthy ? colors.success('Healthy') : colors.error('Unhealthy'),
      r.message,
      r.details || '-',
    ]);

    printTable(headers, rows);
  }

  // Check if all healthy
  const allHealthy = backendResults.every(r => r.healthy);

  console.log('');

  if (allHealthy) {
    printSuccess('All services are healthy');
    return true;
  } else {
    const unhealthyCount = backendResults.filter(r => !r.healthy).length;
    printError(`${unhealthyCount} service(s) are unhealthy`);
    printWarning('Check logs for details: deploy status');
    return false;
  }
}

/**
 * Muestra status detallado de servicios
 */
export async function showDetailedStatus(options: HealthCheckOptions = {}): Promise<void> {
  const { remote } = options;

  printInfo('Fetching detailed container status...');
  console.log('');

  if (remote) {
    const command = `cd ${remote.path}/packages/backend && docker compose ps -a`;
    const result = await executeRemoteCommand(command, remote.ssh);

    if (result.stdout) {
      console.log(result.stdout);
    }
  } else {
    const { stdout } = await execa('docker', ['compose', 'ps', '-a'], {
      cwd: './packages/backend',
    });

    console.log(stdout);
  }

  console.log('');
}
