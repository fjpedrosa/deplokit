import inquirer from 'inquirer';
import { printHeader, printInfo, printWarning, colors } from './utils';
import { loadDeployConfig, detectEnvironment, printConfigSummary, getActiveServices, type Environment } from './config';
import { deployAll, deployBackend, deployFrontend, deployService } from './actions';
import { runMigrations, printMigrationInfo } from './prisma';
import { runHealthCheck, showDetailedStatus } from './health-check';
import { printDeploymentHistory, printDeploymentStats, rollback, cleanOldDeployments } from './history';

/**
 * Estado del menu
 */
interface MenuState {
  environment: Environment;
  config: any;
}

/**
 * Muestra el menu principal
 */
export async function showInteractiveMenu(): Promise<void> {
  const config = loadDeployConfig();
  const environment = detectEnvironment();

  printHeader(`DEPLOY MANAGER - ${config.project.name}`);

  const state: MenuState = {
    environment,
    config,
  };

  await mainMenu(state);
}

/**
 * Menu principal
 */
async function mainMenu(state: MenuState): Promise<void> {
  while (true) {
    console.clear();
    printHeader(`DEPLOY MANAGER - ${state.config.project.name}`);

    console.log(`  Environment: ${colors.highlight(state.environment.toUpperCase())}`);
    console.log(`  Project: ${colors.highlight(state.config.project.name)}`);
    console.log(`  Type: ${colors.highlight(state.config.deployment.type)}`);
    console.log('');

    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'Select an action:',
        choices: [
          { name: 'Change environment (dev/stage/prod)', value: 'change_env' },
          { name: 'Show current configuration', value: 'show_config' },
          new inquirer.Separator('--- Deploy ---'),
          { name: 'Full deploy (backend + frontend)', value: 'deploy_all' },
          { name: 'Backend only (API + Workers)', value: 'deploy_backend' },
          { name: 'Frontend only', value: 'deploy_frontend' },
          { name: 'Deploy specific service', value: 'deploy_service' },
          new inquirer.Separator('--- Operations ---'),
          { name: 'Run Prisma migrations', value: 'run_migrations' },
          { name: 'Health check services', value: 'health_check' },
          { name: 'Show container status', value: 'show_status' },
          new inquirer.Separator('--- History ---'),
          { name: 'View deployment history', value: 'show_history' },
          { name: 'View statistics', value: 'show_stats' },
          { name: 'Rollback to previous deploy', value: 'rollback' },
          { name: 'Clean old history', value: 'clean_history' },
          new inquirer.Separator('---'),
          { name: 'Exit', value: 'exit' },
        ],
      },
    ]);

    if (action === 'exit') {
      printInfo('Goodbye!');
      break;
    }

    try {
      await handleAction(action, state);

      if (action !== 'change_env') {
        await inquirer.prompt([
          {
            type: 'input',
            name: 'continue',
            message: 'Press Enter to continue...',
          },
        ]);
      }
    } catch (error) {
      console.error(error);
      await inquirer.prompt([
        {
          type: 'input',
          name: 'continue',
          message: 'Press Enter to continue...',
        },
      ]);
    }
  }
}

/**
 * Maneja la accion seleccionada
 */
async function handleAction(action: string, state: MenuState): Promise<void> {
  switch (action) {
    case 'change_env':
      await changeEnvironment(state);
      break;

    case 'show_config':
      printConfigSummary(state.config);
      break;

    case 'deploy_all':
      await deployAll({ env: state.environment });
      break;

    case 'deploy_backend':
      await deployBackend({ env: state.environment });
      break;

    case 'deploy_frontend':
      await deployFrontend({ env: state.environment });
      break;

    case 'deploy_service':
      await deploySpecificService(state);
      break;

    case 'run_migrations':
      await runMigrationsInteractive(state);
      break;

    case 'health_check':
      await runHealthCheckInteractive(state);
      break;

    case 'show_status':
      await showStatusInteractive(state);
      break;

    case 'show_history':
      await showHistoryInteractive(state);
      break;

    case 'show_stats':
      printDeploymentStats(state.environment);
      break;

    case 'rollback':
      await rollbackInteractive(state);
      break;

    case 'clean_history':
      await cleanHistoryInteractive();
      break;

    default:
      printWarning('Action not implemented');
  }
}

/**
 * Cambiar entorno
 */
async function changeEnvironment(state: MenuState): Promise<void> {
  const { environment } = await inquirer.prompt([
    {
      type: 'list',
      name: 'environment',
      message: 'Select environment:',
      choices: [
        { name: 'Development (local)', value: 'development' },
        { name: 'Stage (pre-production)', value: 'stage' },
        { name: 'Production', value: 'production' },
      ],
      default: state.environment,
    },
  ]);

  state.environment = environment;

  printInfo(`Environment changed to: ${colors.highlight(environment)}`);
}

/**
 * Deploy de servicio especifico - DINAMICO
 */
async function deploySpecificService(state: MenuState): Promise<void> {
  // Obtener servicios activos de la configuracion dinamicamente
  const activeServices = getActiveServices(state.config);

  if (activeServices.length === 0) {
    printWarning('No active services found in configuration');
    return;
  }

  // Crear opciones del menu basadas en servicios activos
  const serviceChoices = activeServices.map(service => ({
    name: `${service}`,
    value: service,
  }));

  const { service } = await inquirer.prompt([
    {
      type: 'list',
      name: 'service',
      message: 'Select service to deploy:',
      choices: serviceChoices,
    },
  ]);

  await deployService(service, { env: state.environment });
}

/**
 * Ejecutar migraciones interactivo
 */
async function runMigrationsInteractive(state: MenuState): Promise<void> {
  printInfo('Checking migrations...');
  await printMigrationInfo();

  const { confirm } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirm',
      message: 'Run Prisma migrations?',
      default: true,
    },
  ]);

  if (confirm) {
    const { getSSHConfig } = await import('./config');
    const sshConfig = getSSHConfig(state.config);

    await runMigrations({
      remote: sshConfig
        ? {
            path: state.config.deployment.path,
            ssh: {
              target: sshConfig.target,
              sshKey: state.config.deployment.ssh_key,
            },
          }
        : undefined,
    });
  }
}

/**
 * Health check interactivo
 */
async function runHealthCheckInteractive(state: MenuState): Promise<void> {
  const { getSSHConfig } = await import('./config');
  const sshConfig = getSSHConfig(state.config);

  await runHealthCheck(state.config, {
    remote: sshConfig
      ? {
          path: state.config.deployment.path,
          ssh: {
            target: sshConfig.target,
            sshKey: state.config.deployment.ssh_key,
          },
        }
      : undefined,
  });
}

/**
 * Mostrar status interactivo
 */
async function showStatusInteractive(state: MenuState): Promise<void> {
  const { getSSHConfig } = await import('./config');
  const sshConfig = getSSHConfig(state.config);

  await showDetailedStatus({
    remote: sshConfig
      ? {
          path: state.config.deployment.path,
          ssh: {
            target: sshConfig.target,
            sshKey: state.config.deployment.ssh_key,
          },
        }
      : undefined,
  });
}

/**
 * Mostrar historial interactivo
 */
async function showHistoryInteractive(state: MenuState): Promise<void> {
  const { limit, filterEnv } = await inquirer.prompt([
    {
      type: 'number',
      name: 'limit',
      message: 'Number of deployments to show:',
      default: 10,
    },
    {
      type: 'confirm',
      name: 'filterEnv',
      message: `Filter by environment ${state.environment}?`,
      default: false,
    },
  ]);

  printDeploymentHistory(limit, filterEnv ? state.environment : undefined);
}

/**
 * Rollback interactivo
 */
async function rollbackInteractive(state: MenuState): Promise<void> {
  printWarning('Rollback requires manual intervention');

  const { steps } = await inquirer.prompt([
    {
      type: 'number',
      name: 'steps',
      message: 'How many deployments back do you want to go?',
      default: 1,
    },
  ]);

  await rollback({
    environment: state.environment,
    steps,
  });
}

/**
 * Limpiar historial interactivo
 */
async function cleanHistoryInteractive(): Promise<void> {
  const { keepLast, confirm } = await inquirer.prompt([
    {
      type: 'number',
      name: 'keepLast',
      message: 'How many deployments to keep?',
      default: 50,
    },
    {
      type: 'confirm',
      name: 'confirm',
      message: 'Are you sure you want to clean old deployments?',
      default: false,
    },
  ]);

  if (confirm) {
    cleanOldDeployments(keepLast);
  } else {
    printInfo('Operation cancelled');
  }
}
