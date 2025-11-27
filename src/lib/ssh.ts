import { execa } from 'execa';
import ora from 'ora';
import { printError, printSuccess, printInfo, printWarning, colors } from './utils';
import type { DeployConfig } from './config';

/**
 * Opciones para comandos SSH
 */
export interface SSHOptions {
  target: string;
  sshCmd?: string;
  sshKey?: string;
}

/**
 * Opciones para rsync
 */
export interface RsyncOptions extends SSHOptions {
  source: string;
  destination: string;
  exclude?: string[];
  delete?: boolean;
  verbose?: boolean;
}

/**
 * Filtro de workspaces para deployment
 */
export interface WorkspaceFilter {
  include: string[];
}

/**
 * Verifica la conexión SSH
 */
export async function checkSSHConnection(options: SSHOptions): Promise<boolean> {
  const { target, sshCmd = 'ssh', sshKey } = options;

  const spinner = ora('Testing SSH connection...').start();

  try {
    const args = [];

    if (sshKey) {
      args.push('-i', sshKey);
    }

    args.push('-o', 'ConnectTimeout=5', '-o', 'BatchMode=yes', target, 'echo', 'SSH connection successful');

    const { stdout } = await execa(sshCmd, args);

    if (stdout.includes('SSH connection successful')) {
      spinner.succeed('SSH connection verified');
      return true;
    }

    spinner.fail('SSH connection failed');
    return false;
  } catch (error: any) {
    spinner.fail('SSH connection failed');
    printError(error.stderr || error.message);
    printInfo(`Try connecting manually: ${sshCmd} ${target}`);
    return false;
  }
}

/**
 * Ejecuta un comando en el servidor remoto
 */
export async function executeRemoteCommand(
  command: string,
  options: SSHOptions
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const { target, sshCmd = 'ssh', sshKey } = options;

  try {
    const args = [];

    if (sshKey) {
      args.push('-i', sshKey);
    }

    args.push(target, command);

    const result = await execa(sshCmd, args);

    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
    };
  } catch (error: any) {
    return {
      stdout: error.stdout || '',
      stderr: error.stderr || error.message,
      exitCode: error.exitCode || 1,
    };
  }
}

/**
 * Crea un directorio en el servidor remoto
 */
export async function createRemoteDirectory(
  path: string,
  options: SSHOptions
): Promise<void> {
  const spinner = ora(`Creating remote directory: ${path}`).start();

  try {
    const result = await executeRemoteCommand(`mkdir -p ${path}`, options);

    if (result.exitCode === 0) {
      spinner.succeed(`Remote directory created: ${path}`);
    } else {
      spinner.fail('Failed to create remote directory');
      throw new Error(result.stderr);
    }
  } catch (error) {
    spinner.fail('Failed to create remote directory');
    throw error;
  }
}

/**
 * Sincroniza archivos con rsync
 */
export async function syncFilesToRemote(options: RsyncOptions): Promise<void> {
  const { source, destination, target, sshKey, exclude = [], delete: deleteFlag = true, verbose = false } = options;

  const spinner = ora(`Syncing files to ${target}...`).start();

  try {
    const args = ['-az'];

    if (deleteFlag) {
      args.push('--delete');
    }

    if (verbose) {
      args.push('-v');
    }

    // Add excludes
    exclude.forEach(pattern => {
      args.push('--exclude', pattern);
    });

    // SSH options
    if (sshKey) {
      args.push('-e', `ssh -i ${sshKey}`);
    } else {
      args.push('-e', 'ssh');
    }

    args.push(source, `${target}:${destination}`);

    const result = await execa('rsync', args);

    spinner.succeed('Files synced successfully');

    if (verbose && result.stdout) {
      printInfo('Sync details:');
      console.log(colors.gray(result.stdout));
    }
  } catch (error: any) {
    spinner.fail('Failed to sync files');
    printError(error.stderr || error.message);
    throw error;
  }
}

/**
 * Sincroniza carpeta backend/
 */
export async function syncBackendFolder(
  projectRoot: string,
  remotePath: string,
  sshConfig: { target: string; sshKey?: string }
): Promise<void> {
  const excludePatterns = [
    'node_modules/',
    '.git/',
    '.DS_Store',
    '*.bak',
    '.env.local',
    '.env.*.local',
  ];

  printInfo('Syncing packages/backend/ folder...');

  await syncFilesToRemote({
    source: `${projectRoot}/packages/backend/`,
    destination: `${remotePath}/packages/backend/`,
    target: sshConfig.target,
    sshKey: sshConfig.sshKey,
    exclude: excludePatterns,
    delete: true,
    verbose: true,
  });

  printSuccess('packages/backend/ folder synced');
}

/**
 * Sincroniza carpeta shared/
 */
export async function syncSharedFolder(
  projectRoot: string,
  remotePath: string,
  sshConfig: { target: string; sshKey?: string }
): Promise<void> {
  const excludePatterns = [
    'node_modules/',
    '.git/',
    '.DS_Store',
  ];

  printInfo('Syncing packages/shared/ folder...');

  await syncFilesToRemote({
    source: `${projectRoot}/packages/shared/`,
    destination: `${remotePath}/packages/shared/`,
    target: sshConfig.target,
    sshKey: sshConfig.sshKey,
    exclude: excludePatterns,
    delete: true,
  });

  printSuccess('packages/shared/ folder synced');
}

/**
 * Sincroniza archivos raíz necesarios
 */
export async function syncRootFiles(
  projectRoot: string,
  remotePath: string,
  sshConfig: { target: string; sshKey?: string },
  workspaceFilter?: WorkspaceFilter
): Promise<void> {
  printInfo('Syncing root lockfile and package.json...');

  // Always sync lockfile
  await syncFilesToRemote({
    source: `${projectRoot}/bun.lock`,
    destination: `${remotePath}/bun.lock`,
    target: sshConfig.target,
    sshKey: sshConfig.sshKey,
    delete: false,
  });

  // Sync package.json (filtered or original)
  if (workspaceFilter) {
    const { tempPath } = await generateFilteredPackageJson(projectRoot, workspaceFilter);

    try {
      await syncFilesToRemote({
        source: tempPath,
        destination: `${remotePath}/package.json`,
        target: sshConfig.target,
        sshKey: sshConfig.sshKey,
        delete: false,
      });
    } finally {
      await cleanupDeploymentFiles(projectRoot);
    }
  } else {
    await syncFilesToRemote({
      source: `${projectRoot}/package.json`,
      destination: `${remotePath}/package.json`,
      target: sshConfig.target,
      sshKey: sshConfig.sshKey,
      delete: false,
    });
  }

  printSuccess('Root files synced');
}

/**
 * Envuelve un comando con el PATH de Bun para ejecución remota
 */
export function wrapWithBunPath(command: string): string {
  return `export BUN_INSTALL="$HOME/.bun" && export PATH="$BUN_INSTALL/bin:$PATH" && ${command}`;
}

/**
 * Genera un package.json filtrado con solo los workspaces especificados
 */
export async function generateFilteredPackageJson(
  projectRoot: string,
  filter: WorkspaceFilter
): Promise<{ content: string; tempPath: string }> {
  const packageJsonPath = `${projectRoot}/package.json`;
  const packageJson = JSON.parse(await Bun.file(packageJsonPath).text());

  // Filter workspaces
  const filteredPackageJson = {
    ...packageJson,
    workspaces: filter.include,
  };

  // Create temp file
  const tempPath = `${projectRoot}/.package.json.deploy`;
  await Bun.write(tempPath, JSON.stringify(filteredPackageJson, null, 2));

  printInfo(`📦 Deployment package.json configuration:`);
  printInfo(`   Included workspaces: ${filter.include.length}`);
  filter.include.forEach(ws => {
    printInfo(`     ✓ ${ws}`);
  });

  return {
    content: JSON.stringify(filteredPackageJson, null, 2),
    tempPath,
  };
}

/**
 * Limpia archivos temporales de deployment
 */
export async function cleanupDeploymentFiles(projectRoot: string): Promise<void> {
  const tempPath = `${projectRoot}/.package.json.deploy`;
  try {
    await Bun.$`rm -f ${tempPath}`;
  } catch (error) {
    // Silently ignore if file doesn't exist
  }
}

/**
 * Verifica e instala Bun en el servidor remoto si no existe
 */
async function ensureBunInstalled(sshOptions: SSHOptions): Promise<void> {
  // Check if bun is installed
  const checkBun = await executeRemoteCommand('which bun', sshOptions);

  if (checkBun.exitCode !== 0) {
    printInfo('Bun not found on remote server, installing...');

    const installResult = await executeRemoteCommand(
      'curl -fsSL https://bun.sh/install | bash',
      sshOptions
    );

    if (installResult.exitCode === 0) {
      printSuccess('Bun installed successfully');
    } else {
      printWarning('Failed to install Bun automatically');
      printInfo('You may need to install Bun manually on the VPS');
      throw new Error('Bun installation failed');
    }
  } else {
    printSuccess('Bun is already installed');
  }
}

/**
 * Instala dependencias en el servidor remoto desde la raíz del monorepo
 * IMPORTANTE: Instalar desde la raíz es necesario para que Bun resuelva
 * correctamente las dependencias workspace:* entre packages
 */
export async function installRemoteDependencies(
  remotePath: string,
  sshOptions: SSHOptions
): Promise<void> {
  // Ensure Bun is installed first
  await ensureBunInstalled(sshOptions);

  printInfo('Installing workspace dependencies from monorepo root...');

  const installResult = await executeRemoteCommand(
    wrapWithBunPath(`cd ${remotePath} && bun install --no-save`),
    sshOptions
  );

  if (installResult.exitCode === 0) {
    printSuccess('All workspace dependencies installed successfully');
  } else {
    printError('Failed to install workspace dependencies');
    if (installResult.stderr) {
      console.log(colors.gray(installResult.stderr));
    }
    throw new Error('Dependency installation failed');
  }
}
