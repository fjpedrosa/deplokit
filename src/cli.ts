#!/usr/bin/env bun
import { Command } from 'commander';
import { deployAll, deployFrontend, deployBackend, deployService } from './lib/actions';
import { runMigrations } from './lib/prisma';
import { runHealthCheck, showDetailedStatus } from './lib/health-check';
import { printContainerStatus } from './lib/docker';
import { printDeploymentHistory, rollback, printDeploymentStats } from './lib/history';
import { loadDeployConfig, getSSHConfig, getActiveServices } from './lib/config';
import { printInfo, printHeader } from './lib/utils';
import { showInteractiveMenu } from './lib/menu';
import type { Environment } from './lib/config';

const program = new Command();

program
  .name('deploy')
  .description('Deploy Manager - Universal deployment toolkit')
  .version('1.0.0');

// Comando: deploy all
program
  .command('all')
  .description('Full deploy (backend + frontend)')
  .option('-e, --env <environment>', 'Environment: dev|stage|prod', 'production')
  .option('--skip-migrations', 'Skip Prisma migrations')
  .option('--skip-health-check', 'Skip health check after deploy')
  .option('--skip-validations', 'Skip pre-deploy validations')
  .action(async (options) => {
    try {
      await deployAll({
        env: normalizeEnvironment(options.env),
        skipMigrations: options.skipMigrations,
        skipHealthCheck: options.skipHealthCheck,
        skipValidations: options.skipValidations,
      });
    } catch (error) {
      process.exit(1);
    }
  });

// Comando: deploy frontend
program
  .command('frontend')
  .description('Deploy frontend only (Next.js)')
  .option('-e, --env <environment>', 'Environment: dev|stage|prod', 'production')
  .action(async (options) => {
    try {
      await deployFrontend({
        env: normalizeEnvironment(options.env),
      });
    } catch (error) {
      process.exit(1);
    }
  });

// Comando: deploy backend
program
  .command('backend')
  .description('Deploy backend only (API + Workers)')
  .option('-e, --env <environment>', 'Environment: dev|stage|prod', 'production')
  .option('--skip-migrations', 'Skip Prisma migrations')
  .option('--skip-health-check', 'Skip health check after deploy')
  .action(async (options) => {
    try {
      await deployBackend({
        env: normalizeEnvironment(options.env),
        skipMigrations: options.skipMigrations,
        skipHealthCheck: options.skipHealthCheck,
      });
    } catch (error) {
      process.exit(1);
    }
  });

// Comando: deploy service <name>
program
  .command('service <name>')
  .description('Deploy a specific service')
  .option('-e, --env <environment>', 'Environment: dev|stage|prod', 'production')
  .option('--skip-health-check', 'Skip health check after deploy')
  .option('--skip-validations', 'Skip pre-deploy validations')
  .action(async (serviceName, options) => {
    try {
      await deployService(serviceName, {
        env: normalizeEnvironment(options.env),
        skipHealthCheck: options.skipHealthCheck,
        skipValidations: options.skipValidations,
      });
    } catch (error) {
      console.error(error);
      process.exit(1);
    }
  });

// Opcion global: --service=api (compatibilidad con bash script)
program.option('--service <name>', 'Deploy specific service');

// Comando: deploy migrations
program
  .command('migrations')
  .description('Run Prisma migrations only')
  .option('-e, --env <environment>', 'Environment: dev|stage|prod', 'production')
  .action(async (options) => {
    try {
      const config = loadDeployConfig();
      const env = normalizeEnvironment(options.env);

      printInfo(`Running migrations for environment: ${env}`);

      if (config.deployment.type === 'remote') {
        const sshConfig = getSSHConfig(config);

        if (sshConfig) {
          await runMigrations({
            remote: {
              path: config.deployment.path,
              ssh: {
                target: sshConfig.target,
                sshKey: config.deployment.ssh_key,
              },
            },
          });
        }
      } else {
        await runMigrations();
      }
    } catch (error) {
      process.exit(1);
    }
  });

// Comando: deploy health-check
program
  .command('health-check')
  .alias('health')
  .description('Run health check on services')
  .option('-e, --env <environment>', 'Environment: dev|stage|prod', 'production')
  .action(async (options) => {
    try {
      const config = loadDeployConfig();
      const sshConfig = getSSHConfig(config);

      await runHealthCheck(config, {
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
    } catch (error) {
      process.exit(1);
    }
  });

// Comando: deploy status
program
  .command('status')
  .description('Show Docker container status')
  .option('-e, --env <environment>', 'Environment: dev|stage|prod', 'production')
  .action(async (options) => {
    try {
      const config = loadDeployConfig();
      const sshConfig = getSSHConfig(config);

      await showDetailedStatus({
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
    } catch (error) {
      process.exit(1);
    }
  });

// Comando: deploy history
program
  .command('history')
  .description('Show deployment history')
  .option('-l, --limit <number>', 'Number of records to show', '10')
  .option('-e, --env <environment>', 'Filter by environment')
  .action((options) => {
    const limit = parseInt(options.limit) || 10;
    const env = options.env ? normalizeEnvironment(options.env) : undefined;

    printDeploymentHistory(limit, env);
  });

// Comando: deploy stats
program
  .command('stats')
  .description('Show deployment statistics')
  .option('-e, --env <environment>', 'Filter by environment')
  .action((options) => {
    const env = options.env ? normalizeEnvironment(options.env) : undefined;

    printDeploymentStats(env);
  });

// Comando: deploy rollback
program
  .command('rollback')
  .description('Rollback to previous deployment')
  .option('-e, --env <environment>', 'Environment: dev|stage|prod', 'production')
  .option('-n, --steps <number>', 'Number of deployments back', '1')
  .action(async (options) => {
    try {
      await rollback({
        environment: normalizeEnvironment(options.env),
        steps: parseInt(options.steps) || 1,
      });
    } catch (error) {
      process.exit(1);
    }
  });

// Comando: deploy services (list)
program
  .command('services')
  .description('List available services from configuration')
  .action(() => {
    try {
      const config = loadDeployConfig();
      const activeServices = getActiveServices(config);

      printHeader(`Available Services - ${config.project.name}`);

      if (activeServices.length === 0) {
        printInfo('No active services found in configuration');
      } else {
        printInfo('Active services:');
        activeServices.forEach(service => {
          console.log(`  - ${service}`);
        });
      }
    } catch (error) {
      process.exit(1);
    }
  });

// Comando: deploy dashboard
program
  .command('dashboard')
  .description('Start the web dashboard for deployment management')
  .option('-p, --port <port>', 'Port to run dashboard on', '4200')
  .option('--no-open', 'Do not automatically open browser')
  .action(async (options) => {
    try {
      const { startDashboard } = await import('./lib/server/index');

      printHeader('DEPLOY DASHBOARD');

      await startDashboard({
        port: parseInt(options.port),
        open: options.open !== false,
      });
    } catch (error) {
      console.error(`Failed to start dashboard: ${error}`);
      process.exit(1);
    }
  });

// Comando: deploy version
program
  .command('version')
  .description('Show currently deployed version on VPS')
  .option('-e, --env <environment>', 'Environment: dev|stage|prod', 'production')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      const config = loadDeployConfig();
      const sshConfig = getSSHConfig(config);

      if (!sshConfig || config.deployment.type !== 'remote') {
        printInfo('Version tracking is only available for remote deployments');
        printInfo('For local deployments, check deployment history with: deploy history');
        process.exit(0);
      }

      const { getDeployedVersion, printDeployedVersion } = await import('./lib/version');

      printInfo('Fetching deployed version from VPS...');

      const version = await getDeployedVersion(config.deployment.path, {
        target: sshConfig.target,
        sshKey: config.deployment.ssh_key,
      });

      if (version) {
        if (options.json) {
          console.log(JSON.stringify(version, null, 2));
        } else {
          printDeployedVersion(version);
        }
      } else {
        printInfo('No deployed version found on VPS');
        printInfo('Deploy first to create version tracking file');
      }
    } catch (error) {
      console.error(`Failed to get deployed version: ${error}`);
      process.exit(1);
    }
  });

/**
 * Normaliza el nombre del entorno
 */
function normalizeEnvironment(env: string): Environment {
  const normalized = env.toLowerCase();

  switch (normalized) {
    case 'dev':
    case 'development':
      return 'development';

    case 'stage':
    case 'staging':
      return 'stage';

    case 'prod':
    case 'production':
      return 'production';

    default:
      printInfo(`Unknown environment '${env}', defaulting to production`);
      return 'production';
  }
}

// Parse argumentos
program.parse();

// Si no hay comandos → Modo interactivo
const hasCommands = process.argv.slice(2).length > 0;
const hasServiceFlag = program.opts().service;

if (!hasCommands) {
  // Sin argumentos → Menu interactivo
  showInteractiveMenu().catch((error) => {
    console.error(error);
    process.exit(1);
  });
} else if (hasServiceFlag && !program.commands.some((cmd) => process.argv.includes(cmd.name()))) {
  // Se paso --service=api sin comando (compatibilidad con bash)
  const serviceName = program.opts().service;
  const env = program.opts().env || 'production';

  deployService(serviceName, {
    env: normalizeEnvironment(env),
  }).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
