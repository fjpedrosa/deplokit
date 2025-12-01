import { executeRemoteCommand, type SSHOptions } from './ssh';
import { printInfo, printSuccess, printWarning, colors } from './utils';
import { format } from 'date-fns';
import type { Environment } from './config';
import type { DeploymentType } from './history';

/**
 * Deployed version information stored on VPS
 */
export interface DeployedVersionInfo {
  commitHash: string;
  commitMessage?: string;
  timestamp: string;
  environment: Environment;
  services: string[];
  deploymentType: DeploymentType;
  deploymentId?: number;
  duration?: number;
  user: string;
}

/**
 * Options for writing deployed version
 */
export interface WriteVersionOptions {
  remotePath: string;
  ssh: SSHOptions;
  info: DeployedVersionInfo;
}

/**
 * Write .deployed-version file to VPS after successful deploy
 */
export async function writeDeployedVersion(options: WriteVersionOptions): Promise<void> {
  const { remotePath, ssh, info } = options;
  const versionFile = `${remotePath}/.deployed-version`;
  const content = JSON.stringify(info, null, 2);

  // Escape content for shell command using base64 to avoid quote issues
  const base64Content = Buffer.from(content).toString('base64');

  const result = await executeRemoteCommand(
    `echo '${base64Content}' | base64 -d > ${versionFile}`,
    ssh
  );

  if (result.exitCode !== 0) {
    throw new Error(`Failed to write version file: ${result.stderr}`);
  }
}

/**
 * Read .deployed-version file from VPS
 */
export async function getDeployedVersion(
  remotePath: string,
  ssh: SSHOptions
): Promise<DeployedVersionInfo | null> {
  const versionFile = `${remotePath}/.deployed-version`;

  const result = await executeRemoteCommand(
    `cat ${versionFile} 2>/dev/null || echo ''`,
    ssh
  );

  if (!result.stdout.trim()) {
    return null;
  }

  try {
    return JSON.parse(result.stdout) as DeployedVersionInfo;
  } catch {
    return null;
  }
}

/**
 * Print deployed version info to console
 */
export function printDeployedVersion(info: DeployedVersionInfo): void {
  console.log('');
  console.log(colors.highlight('Currently Deployed Version:'));
  console.log('');
  console.log(`  Commit:      ${colors.highlight(info.commitHash)}`);
  if (info.commitMessage) {
    console.log(`  Message:     ${info.commitMessage}`);
  }
  console.log(`  Environment: ${colors.highlight(info.environment)}`);
  console.log(`  Deployed:    ${format(new Date(info.timestamp), 'MMM dd, yyyy HH:mm:ss')}`);
  console.log(`  Duration:    ${info.duration ? `${info.duration}s` : 'unknown'}`);
  console.log(`  User:        ${info.user}`);
  console.log(`  Type:        ${info.deploymentType}`);
  console.log(`  Services:    ${info.services.join(', ')}`);
  if (info.deploymentId) {
    console.log(`  Deploy ID:   #${info.deploymentId}`);
  }
  console.log('');
}

/**
 * Get commit message from current git commit
 */
export async function getCurrentCommitMessage(): Promise<string | undefined> {
  try {
    const { execa } = await import('execa');
    const { stdout } = await execa('git', ['log', '-1', '--format=%s']);
    return stdout.trim();
  } catch {
    return undefined;
  }
}

/**
 * Get current user from environment
 */
export function getCurrentUser(): string {
  return process.env.USER || process.env.USERNAME || 'unknown';
}
