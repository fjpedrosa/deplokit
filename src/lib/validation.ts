import { execa } from 'execa';
import { existsSync } from 'fs';
import { join } from 'path';
import ora from 'ora';
import { printError, printSuccess, printInfo, printWarning, colors, confirm } from './utils';
import { checkDockerDaemon, checkDockerComposeFile } from './docker';
import { checkSSHConnection, type SSHOptions } from './ssh';
import type { DeployConfig, Environment } from './config';

/**
 * Resultado de validacion
 */
export interface ValidationResult {
  passed: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Opciones de validacion
 */
export interface ValidationOptions {
  skipGit?: boolean;
  skipBuild?: boolean;
  skipDocker?: boolean;
  skipSSH?: boolean;
  environment?: Environment;
  deployType?: 'backend' | 'frontend' | 'full';
}

/**
 * Verifica el status de Git
 */
export async function checkGitStatus(): Promise<ValidationResult> {
  const spinner = ora('Checking git status...').start();

  try {
    const { stdout: status } = await execa('git', ['status', '--porcelain']);
    const { stdout: branch } = await execa('git', ['branch', '--show-current']);

    const errors: string[] = [];
    const warnings: string[] = [];

    // Verificar cambios sin commitear
    if (status.trim().length > 0) {
      const uncommittedFiles = status.trim().split('\n').length;
      warnings.push(`You have ${uncommittedFiles} uncommitted changes`);

      spinner.warn('Uncommitted changes detected');
      printWarning(`${uncommittedFiles} file(s) with uncommitted changes`);

      const proceed = await confirm('Continue with uncommitted changes?', false);

      if (!proceed) {
        errors.push('Deployment cancelled - commit or stash your changes first');
        return { passed: false, errors, warnings };
      }
    } else {
      spinner.succeed('Git status clean');
    }

    // Info sobre la rama actual
    printInfo(`Current branch: ${colors.highlight(branch.trim())}`);

    return {
      passed: true,
      errors,
      warnings,
    };
  } catch (error: any) {
    spinner.fail('Git check failed');

    return {
      passed: false,
      errors: ['Git not available or not a git repository'],
      warnings: [],
    };
  }
}

/**
 * Verifica que el build pasa
 */
export async function checkBuildSuccess(cwd?: string): Promise<ValidationResult> {
  const spinner = ora('Running build check...').start();

  try {
    // Try to build frontend
    await execa('bun', ['run', 'build'], {
      cwd: cwd || join(process.cwd(), 'packages', 'frontend'),
      timeout: 120000, // 2 minutes
    });

    spinner.succeed('Build check passed');

    return {
      passed: true,
      errors: [],
      warnings: [],
    };
  } catch (error: any) {
    spinner.fail('Build check failed');
    printError('Frontend build failed');

    if (error.stdout) {
      console.log(colors.gray(error.stdout));
    }

    return {
      passed: false,
      errors: ['Build failed - fix errors before deploying'],
      warnings: [],
    };
  }
}

/**
 * Verifica Docker
 */
export async function checkDocker(cwd?: string): Promise<ValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check Docker daemon
  const daemonRunning = await checkDockerDaemon();

  if (!daemonRunning) {
    errors.push('Docker daemon is not running');

    return {
      passed: false,
      errors,
      warnings,
    };
  }

  printSuccess('Docker daemon is running');

  // Check docker-compose.yml existe
  const backendPath = cwd || join(process.cwd(), 'packages', 'backend');
  const hasComposeFile = await checkDockerComposeFile(backendPath);

  if (!hasComposeFile) {
    errors.push('docker-compose.yml not found in packages/backend/');

    return {
      passed: false,
      errors,
      warnings,
    };
  }

  printSuccess('docker-compose.yml found');

  return {
    passed: true,
    errors,
    warnings,
  };
}

/**
 * Verifica conexion SSH (para remote deployments)
 */
export async function checkSSH(sshOptions: SSHOptions): Promise<ValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  const connected = await checkSSHConnection(sshOptions);

  if (!connected) {
    errors.push('SSH connection failed');

    return {
      passed: false,
      errors,
      warnings,
    };
  }

  return {
    passed: true,
    errors,
    warnings,
  };
}

/**
 * Verifica que existe el archivo .env
 */
export function checkEnvironmentFile(envPath: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!existsSync(envPath)) {
    warnings.push(`.env file not found: ${envPath}`);
    printWarning('Environment file missing - services may fail');

    return {
      passed: true, // Warning, not error
      errors,
      warnings,
    };
  }

  printSuccess('.env file found');

  return {
    passed: true,
    errors,
    warnings,
  };
}

/**
 * Verifica que existe deploy-config.json
 */
export function checkDeployConfig(configPath: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!existsSync(configPath)) {
    errors.push(`Configuration file not found: ${configPath}`);
    printError('deploy-config.json missing');
    printInfo('Create a deploy-config.json in your project root');

    return {
      passed: false,
      errors,
      warnings,
    };
  }

  printSuccess('deploy-config.json found');

  return {
    passed: true,
    errors,
    warnings,
  };
}

/**
 * Validacion completa pre-deploy
 */
export async function runPreDeployValidations(
  config: DeployConfig,
  options: ValidationOptions = {}
): Promise<ValidationResult> {
  printInfo('Running pre-deploy validations...');
  console.log('');

  const allErrors: string[] = [];
  const allWarnings: string[] = [];

  // 1. Git status
  if (!options.skipGit) {
    const gitResult = await checkGitStatus();
    allErrors.push(...gitResult.errors);
    allWarnings.push(...gitResult.warnings);

    if (!gitResult.passed) {
      return { passed: false, errors: allErrors, warnings: allWarnings };
    }
  }

  // 2. Build check (solo para frontend y full deploys)
  const shouldCheckBuild = !options.skipBuild && options.deployType !== 'backend';

  if (shouldCheckBuild) {
    const proceed = await confirm('Run build check before deploy?', true);

    if (proceed) {
      const buildResult = await checkBuildSuccess();
      allErrors.push(...buildResult.errors);
      allWarnings.push(...buildResult.warnings);

      if (!buildResult.passed) {
        const continueAnyway = await confirm('Build failed. Continue anyway?', false);

        if (!continueAnyway) {
          allErrors.push('Deployment cancelled due to build failure');
          return { passed: false, errors: allErrors, warnings: allWarnings };
        }
      }
    }
  } else if (options.deployType === 'backend') {
    printInfo('Skipping build check for backend deploy (builds in Docker)');
  }

  // 3. Docker check (solo para deploys locales)
  if (!options.skipDocker) {
    // Solo verificar Docker localmente si el deploy es local
    // Para deploys remotos, Docker se ejecuta en el servidor
    if (config.deployment.type === 'local') {
      const dockerResult = await checkDocker();
      allErrors.push(...dockerResult.errors);
      allWarnings.push(...dockerResult.warnings);

      if (!dockerResult.passed) {
        return { passed: false, errors: allErrors, warnings: allWarnings };
      }
    } else {
      printInfo('Skipping Docker check for remote deploy (builds on server)');
    }
  }

  // 4. SSH check (solo para remote)
  if (config.deployment.type === 'remote' && !options.skipSSH) {
    const { vps_ip, ssh_user = 'root', ssh_key } = config.deployment;

    if (vps_ip) {
      const sshResult = await checkSSH({
        target: `${ssh_user}@${vps_ip}`,
        sshKey: ssh_key,
      });

      allErrors.push(...sshResult.errors);
      allWarnings.push(...sshResult.warnings);

      if (!sshResult.passed) {
        return { passed: false, errors: allErrors, warnings: allWarnings };
      }
    }
  }

  console.log('');

  if (allErrors.length === 0 && allWarnings.length === 0) {
    printSuccess('All validations passed');
  } else if (allErrors.length === 0) {
    printWarning(`Validations passed with ${allWarnings.length} warning(s)`);
  }

  return {
    passed: allErrors.length === 0,
    errors: allErrors,
    warnings: allWarnings,
  };
}

/**
 * Confirmacion final antes de deploy en produccion
 */
export async function confirmProductionDeploy(): Promise<boolean> {
  console.log('');
  printWarning('WARNING: You are deploying to PRODUCTION!');
  console.log('');

  const confirmed = await confirm('Are you ABSOLUTELY SURE you want to deploy to PRODUCTION?', false);

  if (!confirmed) {
    printInfo('Deployment cancelled');
    return false;
  }

  // Double confirmation para produccion
  const doubleConfirm = await confirm('Type "yes" to confirm production deployment', false);

  if (!doubleConfirm) {
    printInfo('Deployment cancelled');
    return false;
  }

  return true;
}

/**
 * Muestra resumen de validacion
 */
export function printValidationSummary(result: ValidationResult): void {
  if (result.errors.length > 0) {
    console.log('');
    printError('Validation Errors:');
    result.errors.forEach(err => console.log(colors.error(`  - ${err}`)));
  }

  if (result.warnings.length > 0) {
    console.log('');
    printWarning('Validation Warnings:');
    result.warnings.forEach(warn => console.log(colors.warning(`  - ${warn}`)));
  }

  console.log('');
}
