import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { printError, printWarning, printInfo } from './utils';

/**
 * Tipos de deploy
 */
export type DeployType = 'local' | 'remote';

/**
 * Entornos disponibles
 */
export type Environment = 'development' | 'stage' | 'production';

/**
 * Configuración del proyecto
 */
export interface ProjectConfig {
  name: string;
  domain: string;
}

/**
 * Configuración de deployment
 */
export interface DeploymentConfig {
  type: DeployType;
  path: string;
  vps_ip?: string;
  ssh_user?: string;
  ssh_key?: string;
  confirmed?: boolean;
}

/**
 * Configuración de base de datos
 */
export interface DatabaseConfig {
  type: string;
  host: string;
  port: number;
  name: string;
  user: string;
}

/**
 * Configuración de un servicio individual (formato extendido)
 */
export interface ServiceConfig {
  enabled: boolean;
  dockerName?: string;
  healthEndpoint?: string;
  port?: number;
}

/**
 * Servicios activos - DINÁMICO: acepta cualquier nombre de servicio
 */
export interface ServicesConfig {
  [serviceName: string]: boolean | ServiceConfig;
}

/**
 * Secretos del proyecto
 */
export interface SecretsConfig {
  db_password?: string;
  redis_password?: string;
  jwt_secret?: string;
  [key: string]: string | undefined;
}

/**
 * Configuración de paths del proyecto
 */
export interface PathsConfig {
  frontend?: string;
  backend?: string;
  shared?: string;
  prisma?: string;
  dockerCompose?: string;
}

/**
 * Configuración completa de deploy
 */
export interface DeployConfig {
  project: ProjectConfig;
  deployment: DeploymentConfig;
  database: DatabaseConfig;
  services: ServicesConfig;
  secrets?: SecretsConfig;
  paths?: PathsConfig;
}

/**
 * Paths importantes del proyecto
 */
export interface ProjectPaths {
  root: string;
  backend: string;
  frontend: string;
  shared: string;
  scripts: string;
  configFile: string;
  envFile: string;
  prisma: string;
  dockerCompose: string;
}

/**
 * Busca el archivo de configuración en múltiples ubicaciones
 */
export function findConfigFile(): string | null {
  const possiblePaths = [
    // Relativo al toolkit (cuando se ejecuta desde deploy-toolkit/)
    join(process.cwd(), 'deploy-config.json'),
    // En raíz del proyecto
    join(process.cwd(), '../deploy-config.json'),
    // En backend (legacy)
    join(process.cwd(), '../packages/backend/deploy-config.json'),
    // Absoluto desde __dirname
    join(__dirname, '../../deploy-config.json'),
    join(__dirname, '../../../deploy-config.json'),
    join(__dirname, '../../packages/backend/deploy-config.json'),
  ];

  for (const path of possiblePaths) {
    if (existsSync(path)) {
      return path;
    }
  }

  return null;
}

/**
 * Obtiene las rutas del proyecto basándose en la configuración
 */
export function getProjectPaths(config?: DeployConfig): ProjectPaths {
  // Intentar obtener root desde donde está el config file
  const configFile = findConfigFile();
  let root: string;

  if (configFile) {
    // Root es el directorio que contiene deploy-config.json o dos niveles arriba si está en packages/backend
    root = configFile.includes('packages/backend')
      ? join(configFile, '../../..')
      : join(configFile, '..');
  } else {
    // Fallback: asumir que estamos en deploy-toolkit/ o en la raíz
    root = join(__dirname, '../..');
  }

  // Usar paths personalizados si están en config, sino usar defaults
  const paths = config?.paths;

  return {
    root,
    backend: join(root, paths?.backend || 'packages/backend'),
    frontend: join(root, paths?.frontend || 'packages/frontend'),
    shared: join(root, paths?.shared || 'packages/shared'),
    prisma: join(root, paths?.prisma || 'packages/shared/database/prisma'),
    scripts: join(root, 'scripts'),
    configFile: configFile || join(root, 'deploy-config.json'),
    envFile: join(root, paths?.backend || 'packages/backend', '.env'),
    dockerCompose: join(root, paths?.dockerCompose || 'packages/backend/docker-compose.yml'),
  };
}

/**
 * Lee la configuración de deploy
 */
export function loadDeployConfig(): DeployConfig {
  const configFile = findConfigFile();

  if (!configFile) {
    printError('Configuration file not found');
    printInfo('Searched locations:');
    printInfo('  - ./deploy-config.json');
    printInfo('  - ../deploy-config.json');
    printInfo('  - ../packages/backend/deploy-config.json');
    printInfo('');
    printInfo('Create a deploy-config.json in your project root');
    process.exit(1);
  }

  try {
    const content = readFileSync(configFile, 'utf-8');
    const config = JSON.parse(content) as DeployConfig;

    // Validar configuración básica
    if (!config.project || !config.deployment) {
      printError('Invalid configuration: missing required sections');
      process.exit(1);
    }

    return config;
  } catch (error) {
    printError(`Failed to load configuration: ${error}`);
    process.exit(1);
  }
}

/**
 * Verifica si el archivo .env existe
 */
export function checkEnvFile(): boolean {
  const config = loadDeployConfig();
  const paths = getProjectPaths(config);
  const exists = existsSync(paths.envFile);

  if (!exists) {
    printWarning(`.env file not found: ${paths.envFile}`);
    printInfo('Some services may fail without environment variables');
  }

  return exists;
}

/**
 * Obtiene la configuración de SSH si es remote
 */
export function getSSHConfig(config: DeployConfig): {
  target: string;
  sshCmd: string;
  rsyncSsh: string;
} | null {
  if (config.deployment.type !== 'remote') {
    return null;
  }

  const { vps_ip, ssh_user = 'root', ssh_key } = config.deployment;

  if (!vps_ip) {
    printError('VPS IP not configured for remote deployment');
    process.exit(1);
  }

  const target = `${ssh_user}@${vps_ip}`;

  let sshCmd = 'ssh';
  let rsyncSsh = 'ssh';

  if (ssh_key) {
    sshCmd = `ssh -i ${ssh_key}`;
    rsyncSsh = `ssh -i ${ssh_key}`;
  }

  return {
    target,
    sshCmd,
    rsyncSsh,
  };
}

/**
 * Obtiene los servicios activos
 */
export function getActiveServices(config: DeployConfig): string[] {
  return Object.entries(config.services)
    .filter(([_, value]) => {
      if (typeof value === 'boolean') return value;
      if (typeof value === 'object') return value.enabled;
      return false;
    })
    .map(([serviceName]) => serviceName);
}

/**
 * Verifica si un servicio está activo
 */
export function isServiceActive(config: DeployConfig, serviceName: string): boolean {
  const normalized = normalizeServiceName(serviceName);
  const service = config.services[normalized];

  if (typeof service === 'boolean') return service;
  if (typeof service === 'object') return service.enabled;
  return false;
}

/**
 * Valida que un servicio existe en la configuración - DINÁMICO
 */
export function validateService(config: DeployConfig, serviceName: string): boolean {
  const normalized = normalizeServiceName(serviceName);
  return normalized in config.services;
}

/**
 * Normaliza el nombre de servicio
 * Convierte kebab-case a snake_case y normaliza variantes comunes
 */
export function normalizeServiceName(serviceName: string): string {
  // Convertir kebab-case a snake_case
  const normalized = serviceName.toLowerCase().replace(/-/g, '_');

  // Mapeo de alias comunes
  const aliasMap: Record<string, string> = {
    'pdfworker': 'pdf_worker',
    'imageworker': 'image_worker',
    'emailworker': 'email_worker',
    'scraperworker': 'scraper_worker',
    'scraper': 'scraper_worker',
    'worker': 'scraper_worker',
  };

  return aliasMap[normalized] || normalized;
}

/**
 * Mapea el nombre de servicio de la configuración al nombre real en docker-compose
 * DINÁMICO: usa dockerName de config o genera automáticamente
 */
export function getDockerComposeServiceName(config: DeployConfig, serviceName: string): string {
  const normalized = normalizeServiceName(serviceName);
  const service = config.services[normalized];

  // Si el servicio tiene dockerName configurado, usarlo
  if (typeof service === 'object' && service.dockerName) {
    return service.dockerName;
  }

  // Default: project-name + service-name en kebab-case
  const projectName = config.project.name;
  const kebabServiceName = normalized.replace(/_/g, '-');

  return `${projectName}-${kebabServiceName}`;
}

/**
 * Obtiene la configuración completa de un servicio
 */
export function getServiceConfig(config: DeployConfig, serviceName: string): ServiceConfig | null {
  const normalized = normalizeServiceName(serviceName);
  const service = config.services[normalized];

  if (!service) return null;

  if (typeof service === 'boolean') {
    return { enabled: service };
  }

  return service;
}

/**
 * Obtiene el health endpoint de un servicio
 */
export function getServiceHealthEndpoint(config: DeployConfig, serviceName: string): string | null {
  const normalized = normalizeServiceName(serviceName);
  const service = config.services[normalized];

  if (typeof service === 'object' && service.healthEndpoint) {
    return service.healthEndpoint;
  }

  // Default: solo API tiene health endpoint
  if (normalized === 'api') {
    return '/health';
  }

  return null;
}

/**
 * Muestra resumen de la configuración
 */
export function printConfigSummary(config: DeployConfig): void {
  console.log('');
  console.log('Deployment Configuration:');
  console.log(`  • Project:      ${config.project.name}`);
  console.log(`  • Domain:       ${config.project.domain}`);
  console.log(`  • Type:         ${config.deployment.type}`);

  if (config.deployment.type === 'remote') {
    console.log(`  • VPS IP:       ${config.deployment.vps_ip}`);
    console.log(`  • SSH User:     ${config.deployment.ssh_user}`);
    console.log(`  • Remote Path:  ${config.deployment.path}`);
  }

  const activeServices = getActiveServices(config);
  console.log(`  • Services:     ${activeServices.join(', ')}`);
  console.log('');
}

/**
 * Detecta el entorno basado en variables o configuración
 */
export function detectEnvironment(): Environment {
  const nodeEnv = process.env.NODE_ENV?.toLowerCase();

  if (nodeEnv === 'production' || nodeEnv === 'prod') {
    return 'production';
  }

  if (nodeEnv === 'staging' || nodeEnv === 'stage') {
    return 'stage';
  }

  return 'development';
}

/**
 * Helper para definir configuración con TypeScript (intellisense)
 */
export function defineConfig(config: DeployConfig): DeployConfig {
  return config;
}
