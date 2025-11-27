// @fjpedrosa/deploy-toolkit
// Universal deployment toolkit for monorepo projects

// Config
export {
  loadDeployConfig,
  findConfigFile,
  getProjectPaths,
  getSSHConfig,
  getActiveServices,
  isServiceActive,
  validateService,
  normalizeServiceName,
  getDockerComposeServiceName,
  getServiceHealthEndpoint,
  detectEnvironment,
  printConfigSummary,
  defineConfig,
  type DeployType,
  type Environment,
  type ProjectConfig,
  type DeploymentConfig,
  type DatabaseConfig,
  type ServiceConfig,
  type ServicesConfig,
  type SecretsConfig,
  type PathsConfig,
  type DeployConfig,
  type ProjectPaths,
} from './lib/config';

// Actions
export {
  deployAll,
  deployBackend,
  deployFrontend,
  deployService,
  type DeployOptions,
} from './lib/actions';

// SSH
export {
  checkSSHConnection,
  executeRemoteCommand,
  createRemoteDirectory,
  syncFilesToRemote,
  syncBackendFolder,
  syncSharedFolder,
  syncRootFiles,
  wrapWithBunPath,
  generateFilteredPackageJson,
  cleanupDeploymentFiles,
  installRemoteDependencies,
  type SSHOptions,
  type RsyncOptions,
  type WorkspaceFilter,
} from './lib/ssh';

// Docker
export {
  dockerComposePull,
  dockerComposeUp,
  dockerComposeDown,
  dockerComposeBuild,
  getContainerStatus,
  checkContainersExist,
  getContainerLogs,
  printContainerStatus,
  checkContainersHealth,
  checkDockerDaemon,
  checkDockerComposeFile,
  type DockerOptions,
  type ContainerStatus,
} from './lib/docker';

// Prisma
export {
  runMigrations,
  generatePrismaClient,
  checkMigrationStatus,
  getMigrationList,
  hasPendingMigrations,
  printMigrationInfo,
  type PrismaOptions,
} from './lib/prisma';

// Health Check
export {
  checkBackendServices,
  checkAPIEndpoints,
  waitForContainers,
  runHealthCheck,
  showDetailedStatus,
  type HealthCheckResult,
  type HealthCheckOptions,
} from './lib/health-check';

// History
export {
  saveDeployment,
  updateDeploymentStatus,
  getDeploymentHistory,
  getLastSuccessfulDeployment,
  getDeploymentById,
  printDeploymentHistory,
  markAsRolledBack,
  rollback,
  cleanOldDeployments,
  getDeploymentStats,
  printDeploymentStats,
  getCurrentCommitHash,
  type DeploymentType,
  type DeploymentStatus,
  type DeploymentRecord,
  type SaveDeploymentOptions,
} from './lib/history';

// Validation
export {
  checkGitStatus,
  checkBuildSuccess,
  checkDocker,
  checkSSH,
  checkEnvironmentFile,
  checkDeployConfig,
  runPreDeployValidations,
  confirmProductionDeploy,
  printValidationSummary,
  type ValidationResult,
  type ValidationOptions,
} from './lib/validation';

// Utils
export {
  colors,
  printSuccess,
  printError,
  printWarning,
  printInfo,
  printHeader,
  runWithSpinner,
  execCommand,
  execCommandWithSpinner,
  formatTime,
  sleep,
  confirm,
  createLogger,
  handleError,
  truncate,
  formatBytes,
  printTable,
} from './lib/utils';

// Menu
export { showInteractiveMenu } from './lib/menu';
