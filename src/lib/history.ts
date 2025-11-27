import { Database } from 'bun:sqlite';
import { join } from 'path';
import { format } from 'date-fns';
import { printSuccess, printInfo, printError, printWarning, printTable, colors } from './utils';
import type { Environment } from './config';

/**
 * Tipos de deployment
 */
export type DeploymentType = 'full' | 'backend' | 'frontend' | 'service';

/**
 * Status de deployment
 */
export type DeploymentStatus = 'pending' | 'in_progress' | 'success' | 'failed' | 'rolled_back';

/**
 * Registro de deployment
 */
export interface DeploymentRecord {
  id: number;
  timestamp: string;
  environment: Environment;
  type: DeploymentType;
  service?: string;
  commit_hash?: string;
  duration?: number;
  status: DeploymentStatus;
  logs?: string;
  user: string;
}

/**
 * Opciones para guardar deployment
 */
export interface SaveDeploymentOptions {
  environment: Environment;
  type: DeploymentType;
  service?: string;
  commitHash?: string;
  duration?: number;
  status: DeploymentStatus;
  logs?: string;
}

/**
 * Path a la base de datos SQLite (relativo al proyecto que usa el toolkit)
 */
function getDBPath(): string {
  // Usa el directorio de scripts del proyecto o cwd
  return join(process.cwd(), 'deployments.db');
}

/**
 * Obtiene la instancia de la base de datos
 */
function getDatabase(): Database {
  const db = new Database(getDBPath());

  // Crear tabla si no existe
  db.run(`
    CREATE TABLE IF NOT EXISTS deployments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      environment TEXT NOT NULL,
      type TEXT NOT NULL,
      service TEXT,
      commit_hash TEXT,
      duration INTEGER,
      status TEXT NOT NULL,
      logs TEXT,
      user TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  return db;
}

/**
 * Obtiene el nombre del usuario actual
 */
function getCurrentUser(): string {
  return process.env.USER || process.env.USERNAME || 'unknown';
}

/**
 * Obtiene el commit hash actual de git
 */
export async function getCurrentCommitHash(): Promise<string | undefined> {
  try {
    const { execa } = await import('execa');
    const { stdout } = await execa('git', ['rev-parse', '--short', 'HEAD']);
    return stdout.trim();
  } catch (error) {
    return undefined;
  }
}

/**
 * Guarda un deployment en el historial
 */
export function saveDeployment(options: SaveDeploymentOptions): number {
  const db = getDatabase();

  const stmt = db.prepare(`
    INSERT INTO deployments (timestamp, environment, type, service, commit_hash, duration, status, logs, user)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    new Date().toISOString(),
    options.environment,
    options.type,
    options.service || null,
    options.commitHash || null,
    options.duration || null,
    options.status,
    options.logs || null,
    getCurrentUser()
  );

  db.close();

  return result.lastInsertRowid as number;
}

/**
 * Actualiza el status de un deployment
 */
export function updateDeploymentStatus(
  id: number,
  status: DeploymentStatus,
  duration?: number,
  logs?: string
): void {
  const db = getDatabase();

  const stmt = db.prepare(`
    UPDATE deployments
    SET status = ?, duration = ?, logs = ?
    WHERE id = ?
  `);

  stmt.run(status, duration || null, logs || null, id);
  db.close();
}

/**
 * Obtiene el historial de deployments
 */
export function getDeploymentHistory(limit: number = 10, environment?: Environment): DeploymentRecord[] {
  const db = getDatabase();

  let query = 'SELECT * FROM deployments';
  const params: any[] = [];

  if (environment) {
    query += ' WHERE environment = ?';
    params.push(environment);
  }

  query += ' ORDER BY id DESC LIMIT ?';
  params.push(limit);

  const stmt = db.prepare(query);
  const rows = stmt.all(...params) as DeploymentRecord[];

  db.close();

  return rows;
}

/**
 * Obtiene el ultimo deployment exitoso
 */
export function getLastSuccessfulDeployment(environment?: Environment): DeploymentRecord | null {
  const db = getDatabase();

  let query = 'SELECT * FROM deployments WHERE status = ?';
  const params: any[] = ['success'];

  if (environment) {
    query += ' AND environment = ?';
    params.push(environment);
  }

  query += ' ORDER BY id DESC LIMIT 1';

  const stmt = db.prepare(query);
  const row = stmt.get(...params) as DeploymentRecord | undefined;

  db.close();

  return row || null;
}

/**
 * Obtiene deployment por ID
 */
export function getDeploymentById(id: number): DeploymentRecord | null {
  const db = getDatabase();

  const stmt = db.prepare('SELECT * FROM deployments WHERE id = ?');
  const row = stmt.get(id) as DeploymentRecord | undefined;

  db.close();

  return row || null;
}

/**
 * Muestra el historial de deployments
 */
export function printDeploymentHistory(limit: number = 10, environment?: Environment): void {
  const history = getDeploymentHistory(limit, environment);

  if (history.length === 0) {
    printWarning('No deployment history found');
    return;
  }

  printInfo(`Showing last ${history.length} deployments${environment ? ` (${environment})` : ''}:`);
  console.log('');

  const headers = ['ID', 'Date', 'Env', 'Type', 'Service', 'Commit', 'Duration', 'Status', 'User'];
  const rows = history.map(d => [
    String(d.id),
    format(new Date(d.timestamp), 'MM/dd HH:mm'),
    d.environment.substring(0, 4),
    d.type,
    d.service || '-',
    d.commit_hash?.substring(0, 7) || '-',
    d.duration ? `${d.duration}s` : '-',
    d.status === 'success' ? colors.success(d.status) :
    d.status === 'failed' ? colors.error(d.status) :
    d.status,
    d.user,
  ]);

  printTable(headers, rows);
}

/**
 * Marca un deployment como rolled back
 */
export function markAsRolledBack(id: number): void {
  updateDeploymentStatus(id, 'rolled_back');
  printSuccess(`Deployment #${id} marked as rolled back`);
}

/**
 * Implementacion basica de rollback
 */
export async function rollback(options: { environment?: Environment; steps?: number } = {}): Promise<void> {
  const { environment, steps = 1 } = options;

  printWarning('Rollback functionality is not yet fully implemented');
  printInfo('This would require:');
  console.log('  - Backup of previous deployments');
  console.log('  - Version tagging in Docker images');
  console.log('  - Database migration rollback mechanism');
  console.log('');

  const lastSuccess = getLastSuccessfulDeployment(environment);

  if (lastSuccess) {
    printInfo(`Last successful deployment was #${lastSuccess.id}:`);
    console.log(`  - Date: ${format(new Date(lastSuccess.timestamp), 'MMM dd, yyyy HH:mm')}`);
    console.log(`  - Type: ${lastSuccess.type}`);
    console.log(`  - Commit: ${lastSuccess.commit_hash || 'unknown'}`);
    console.log('');

    printWarning('Manual rollback required - use git checkout and redeploy');
  } else {
    printError('No successful deployment found to rollback to');
  }
}

/**
 * Limpia deployments antiguos
 */
export function cleanOldDeployments(keepLast: number = 50): number {
  const db = getDatabase();

  const stmt = db.prepare(`
    DELETE FROM deployments
    WHERE id NOT IN (
      SELECT id FROM deployments
      ORDER BY id DESC
      LIMIT ?
    )
  `);

  const result = stmt.run(keepLast);
  db.close();

  const deleted = result.changes;

  if (deleted > 0) {
    printSuccess(`Cleaned ${deleted} old deployment records (keeping last ${keepLast})`);
  }

  return deleted;
}

/**
 * Obtiene estadisticas de deployments
 */
export function getDeploymentStats(environment?: Environment): {
  total: number;
  success: number;
  failed: number;
  successRate: number;
} {
  const db = getDatabase();

  let query = 'SELECT status, COUNT(*) as count FROM deployments';
  const params: any[] = [];

  if (environment) {
    query += ' WHERE environment = ?';
    params.push(environment);
  }

  query += ' GROUP BY status';

  const stmt = db.prepare(query);
  const rows = stmt.all(...params) as Array<{ status: string; count: number }>;

  db.close();

  const stats = {
    total: 0,
    success: 0,
    failed: 0,
    successRate: 0,
  };

  rows.forEach(row => {
    stats.total += row.count;
    if (row.status === 'success') {
      stats.success = row.count;
    } else if (row.status === 'failed') {
      stats.failed = row.count;
    }
  });

  stats.successRate = stats.total > 0 ? (stats.success / stats.total) * 100 : 0;

  return stats;
}

/**
 * Muestra estadisticas de deployments
 */
export function printDeploymentStats(environment?: Environment): void {
  const stats = getDeploymentStats(environment);

  printInfo(`Deployment Statistics${environment ? ` (${environment})` : ''}:`);
  console.log(`  - Total deployments: ${stats.total}`);
  console.log(`  - Successful: ${colors.success(String(stats.success))}`);
  console.log(`  - Failed: ${colors.error(String(stats.failed))}`);
  console.log(`  - Success rate: ${stats.successRate.toFixed(1)}%`);
  console.log('');
}
