import { execa } from 'execa';
import ora from 'ora';
import { printError, printSuccess, printInfo, printWarning, colors } from './utils';

/**
 * Opciones para comandos Docker
 */
export interface DockerOptions {
  cwd?: string;
  service?: string;
  env?: Record<string, string>;
}

/**
 * Status de un contenedor
 */
export interface ContainerStatus {
  name: string;
  state: string;
  status: string;
  service: string;
}

/**
 * Ejecuta docker compose pull con progress
 */
export async function dockerComposePull(options: DockerOptions = {}): Promise<void> {
  const { cwd, service } = options;
  const spinner = ora('Pulling Docker images...').start();

  try {
    const args = ['compose', 'pull'];
    if (service) {
      args.push(service);
    }

    const { stdout } = await execa('docker', args, {
      cwd: cwd || process.cwd(),
      all: true,
    });

    spinner.succeed('Docker images pulled successfully');

    // Mostrar resumen si hay output relevante
    if (stdout && stdout.includes('Pull complete')) {
      printInfo('All images are up to date');
    }
  } catch (error: any) {
    spinner.fail('Failed to pull Docker images');
    printError(error.stderr || error.message);
    throw error;
  }
}

/**
 * Ejecuta docker compose up
 */
export async function dockerComposeUp(options: DockerOptions & {
  build?: boolean;
  detached?: boolean;
  forceRecreate?: boolean;
  noDeps?: boolean;
} = {}): Promise<void> {
  const { cwd, service, build = true, detached = true, forceRecreate = false, noDeps = false } = options;

  const args = ['compose', 'up'];

  if (detached) {
    args.push('-d');
  }

  if (build) {
    args.push('--build');
  }

  if (forceRecreate) {
    args.push('--force-recreate');
  }

  if (noDeps && service) {
    args.push('--no-deps');
  }

  if (service) {
    args.push(service);
  }

  const actionText = service
    ? `Starting service: ${service}`
    : 'Starting Docker stack';

  const spinner = ora(actionText).start();

  try {
    await execa('docker', args, {
      cwd: cwd || process.cwd(),
    });

    spinner.succeed(
      service
        ? `Service ${service} started successfully`
        : 'Docker stack started successfully'
    );
  } catch (error: any) {
    spinner.fail('Failed to start containers');
    printError(error.stderr || error.message);
    throw error;
  }
}

/**
 * Ejecuta docker compose down
 */
export async function dockerComposeDown(options: DockerOptions & {
  volumes?: boolean;
} = {}): Promise<void> {
  const { cwd, volumes = false } = options;
  const args = ['compose', 'down'];

  if (volumes) {
    args.push('-v');
  }

  const spinner = ora('Stopping Docker stack...').start();

  try {
    await execa('docker', args, {
      cwd: cwd || process.cwd(),
    });

    spinner.succeed('Docker stack stopped successfully');
  } catch (error: any) {
    spinner.fail('Failed to stop Docker stack');
    printError(error.stderr || error.message);
    throw error;
  }
}

/**
 * Ejecuta docker compose build
 */
export async function dockerComposeBuild(options: DockerOptions = {}): Promise<void> {
  const { cwd, service } = options;
  const args = ['compose', 'build'];

  if (service) {
    args.push(service);
  }

  const spinner = ora(
    service ? `Building service: ${service}` : 'Building services...'
  ).start();

  try {
    await execa('docker', args, {
      cwd: cwd || process.cwd(),
    });

    spinner.succeed(
      service
        ? `Service ${service} built successfully`
        : 'Services built successfully'
    );
  } catch (error: any) {
    spinner.fail('Build failed');
    printError(error.stderr || error.message);
    throw error;
  }
}

/**
 * Obtiene el status de contenedores
 */
export async function getContainerStatus(options: DockerOptions = {}): Promise<ContainerStatus[]> {
  const { cwd } = options;

  try {
    const { stdout } = await execa(
      'docker',
      ['compose', 'ps', '--format', '{{.Name}}|{{.State}}|{{.Status}}|{{.Service}}'],
      {
        cwd: cwd || process.cwd(),
      }
    );

    if (!stdout.trim()) {
      return [];
    }

    return stdout
      .trim()
      .split('\n')
      .map(line => {
        const [name, state, status, service] = line.split('|');
        return { name, state, status, service };
      });
  } catch (error) {
    return [];
  }
}

/**
 * Verifica si los contenedores existen
 */
export async function checkContainersExist(options: DockerOptions = {}): Promise<number> {
  const containers = await getContainerStatus(options);
  return containers.length;
}

/**
 * Obtiene logs de un contenedor
 */
export async function getContainerLogs(
  serviceName: string,
  options: DockerOptions & { tail?: number } = {}
): Promise<string> {
  const { cwd, tail = 50 } = options;

  try {
    const { stdout } = await execa(
      'docker',
      ['compose', 'logs', '--tail', String(tail), serviceName],
      {
        cwd: cwd || process.cwd(),
      }
    );

    return stdout;
  } catch (error: any) {
    printError(`Failed to get logs for ${serviceName}: ${error.message}`);
    return '';
  }
}

/**
 * Muestra el status de contenedores en formato tabla
 */
export async function printContainerStatus(options: DockerOptions = {}): Promise<void> {
  const containers = await getContainerStatus(options);

  if (containers.length === 0) {
    printWarning('No containers found');
    return;
  }

  console.log('');
  console.log(colors.highlight('Container Status:'));
  console.log('');

  const headers = ['Service', 'Name', 'State', 'Status'];
  const rows = containers.map(c => [
    c.service,
    c.name,
    c.state === 'running' ? colors.success(c.state) : colors.error(c.state),
    c.status,
  ]);

  // Imprimir tabla simple
  console.log(headers.join(' | '));
  console.log('-'.repeat(80));

  rows.forEach(row => {
    console.log(row.join(' | '));
  });

  console.log('');
}

/**
 * Verifica la salud de contenedores
 */
export async function checkContainersHealth(options: DockerOptions = {}): Promise<{
  healthy: number;
  unhealthy: number;
  total: number;
}> {
  const containers = await getContainerStatus(options);

  const healthy = containers.filter(c => c.state === 'running').length;
  const unhealthy = containers.filter(c => c.state !== 'running').length;

  return {
    healthy,
    unhealthy,
    total: containers.length,
  };
}

/**
 * Verifica si Docker daemon está corriendo
 */
export async function checkDockerDaemon(): Promise<boolean> {
  try {
    await execa('docker', ['info']);
    return true;
  } catch (error) {
    printError('Docker daemon is not running');
    printInfo('Please start Docker and try again');
    return false;
  }
}

/**
 * Verifica si docker-compose.yml existe
 */
export async function checkDockerComposeFile(cwd?: string): Promise<boolean> {
  const { existsSync } = await import('fs');
  const { join } = await import('path');

  const path = join(cwd || process.cwd(), 'docker-compose.yml');
  return existsSync(path);
}
