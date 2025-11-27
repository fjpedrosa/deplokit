import { execa } from 'execa';
import ora from 'ora';
import { printError, printSuccess, printInfo, printWarning, colors } from './utils';
import type { SSHOptions } from './ssh';
import { executeRemoteCommand, wrapWithBunPath } from './ssh';

/**
 * Opciones para comandos Prisma
 */
export interface PrismaOptions {
  cwd?: string;
  schemaPath?: string;
  remote?: {
    path: string;
    ssh: SSHOptions;
  };
}

/**
 * Path relativo del schema de Prisma (default)
 */
const DEFAULT_SCHEMA_PATH = '../../shared/database/prisma/schema.prisma';

/**
 * Ejecuta Prisma migrations (deploy)
 */
export async function runMigrations(options: PrismaOptions = {}): Promise<void> {
  const { cwd, schemaPath = DEFAULT_SCHEMA_PATH, remote } = options;

  const spinner = ora('Running Prisma migrations...').start();

  try {
    if (remote) {
      // Remote migrations via SSH
      const command = wrapWithBunPath(
        `cd ${remote.path}/packages/backend/api && bunx prisma migrate deploy --schema=${schemaPath}`
      );
      const result = await executeRemoteCommand(command, remote.ssh);

      if (result.exitCode === 0) {
        spinner.succeed('Prisma migrations applied successfully');

        if (result.stdout) {
          const relevantLines = result.stdout
            .split('\n')
            .filter(line =>
              line.includes('migrations') ||
              line.includes('applied') ||
              line.includes('Applying') ||
              line.includes('Database')
            );

          if (relevantLines.length > 0) {
            printInfo('Migration details:');
            relevantLines.forEach(line => console.log(colors.gray(`  ${line}`)));
          }
        }
      } else {
        spinner.fail('Prisma migrations failed');
        if (result.stderr) {
          printError(result.stderr);
        }
        throw new Error('Migration failed');
      }
    } else {
      // Local migrations
      const args = ['prisma', 'migrate', 'deploy', `--schema=${schemaPath}`];

      const result = await execa('bunx', args, {
        cwd: cwd || process.cwd(),
      });

      spinner.succeed('Prisma migrations applied successfully');

      if (result.stdout) {
        const relevantLines = result.stdout
          .split('\n')
          .filter(line =>
            line.includes('migrations') ||
            line.includes('applied') ||
            line.includes('Applying') ||
            line.includes('Database')
          );

        if (relevantLines.length > 0) {
          printInfo('Migration details:');
          relevantLines.forEach(line => console.log(colors.gray(`  ${line}`)));
        }
      }
    }
  } catch (error: any) {
    spinner.fail('Prisma migrations failed');
    printError(error.stderr || error.message);
    throw error;
  }
}

/**
 * Genera Prisma Client
 */
export async function generatePrismaClient(options: PrismaOptions = {}): Promise<void> {
  const { cwd, schemaPath = DEFAULT_SCHEMA_PATH, remote } = options;

  const spinner = ora('Generating Prisma Client...').start();

  try {
    if (remote) {
      // Remote generation via SSH
      const command = wrapWithBunPath(
        `cd ${remote.path}/packages/backend/api && bunx prisma generate --schema=${schemaPath}`
      );
      const result = await executeRemoteCommand(command, remote.ssh);

      if (result.exitCode === 0) {
        spinner.succeed('Prisma Client generated successfully');
      } else {
        spinner.fail('Failed to generate Prisma Client');
        if (result.stderr) {
          printError(result.stderr);
        }
        throw new Error('Client generation failed');
      }
    } else {
      // Local generation
      const args = ['prisma', 'generate', `--schema=${schemaPath}`];

      await execa('bunx', args, {
        cwd: cwd || process.cwd(),
      });

      spinner.succeed('Prisma Client generated successfully');
    }
  } catch (error: any) {
    spinner.fail('Failed to generate Prisma Client');
    printError(error.stderr || error.message);
    throw error;
  }
}

/**
 * Verifica el status de migraciones
 */
export async function checkMigrationStatus(options: PrismaOptions = {}): Promise<{
  pending: string[];
  applied: string[];
}> {
  const { cwd, schemaPath = DEFAULT_SCHEMA_PATH, remote } = options;

  try {
    let stdout: string;

    if (remote) {
      // Remote status via SSH
      const command = wrapWithBunPath(
        `cd ${remote.path}/packages/backend/api && bunx prisma migrate status --schema=${schemaPath}`
      );
      const result = await executeRemoteCommand(command, remote.ssh);
      stdout = result.stdout;
    } else {
      // Local status
      const args = ['prisma', 'migrate', 'status', `--schema=${schemaPath}`];

      const result = await execa('bunx', args, {
        cwd: cwd || process.cwd(),
      });

      stdout = result.stdout;
    }

    // Parse output to detect pending/applied migrations
    const pending: string[] = [];
    const applied: string[] = [];

    const lines = stdout.split('\n');
    let isPendingSection = false;

    for (const line of lines) {
      if (line.includes('Following migration') && line.includes('not yet been applied')) {
        isPendingSection = true;
        continue;
      }

      if (isPendingSection && line.match(/^\s+\d+_/)) {
        pending.push(line.trim());
      }

      if (line.includes('Database schema is up to date')) {
        break;
      }
    }

    return { pending, applied };
  } catch (error: any) {
    printWarning('Could not check migration status');
    return { pending: [], applied: [] };
  }
}

/**
 * Obtiene lista de migraciones
 */
export async function getMigrationList(options: PrismaOptions = {}): Promise<string[]> {
  const { cwd } = options;
  const { readdirSync, existsSync } = await import('fs');
  const { join } = await import('path');

  const migrationsPath = join(
    cwd || process.cwd(),
    '../../shared/database/prisma/migrations'
  );

  if (!existsSync(migrationsPath)) {
    return [];
  }

  try {
    const files = readdirSync(migrationsPath);
    return files.filter(f => f.match(/^\d+_/)).sort();
  } catch (error) {
    return [];
  }
}

/**
 * Verifica si hay migraciones pendientes
 */
export async function hasPendingMigrations(options: PrismaOptions = {}): Promise<boolean> {
  const { pending } = await checkMigrationStatus(options);
  return pending.length > 0;
}

/**
 * Muestra información de migraciones
 */
export async function printMigrationInfo(options: PrismaOptions = {}): Promise<void> {
  printInfo('Checking migration status...');

  const { pending, applied } = await checkMigrationStatus(options);

  if (pending.length > 0) {
    printWarning(`${pending.length} pending migration(s):`);
    pending.forEach(m => console.log(colors.yellow(`  - ${m}`)));
  } else {
    printSuccess('All migrations applied - database is up to date');
  }

  const allMigrations = await getMigrationList(options);
  if (allMigrations.length > 0) {
    printInfo(`Total migrations in project: ${allMigrations.length}`);
  }
}
