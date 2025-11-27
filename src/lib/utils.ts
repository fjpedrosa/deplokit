import chalk from 'chalk';
import ora, { Ora } from 'ora';
import { execa, type Options as ExecaOptions } from 'execa';
import { formatDuration, intervalToDuration } from 'date-fns';

/**
 * Colores para mensajes de consola
 */
export const colors = {
  success: chalk.green,
  error: chalk.red,
  warning: chalk.yellow,
  info: chalk.blue,
  highlight: chalk.cyan,
  white: chalk.white,
  gray: chalk.gray,
  bold: chalk.bold,
};

/**
 * Imprime mensaje de éxito
 */
export function printSuccess(message: string): void {
  console.log(colors.success(`✅ ${message}`));
}

/**
 * Imprime mensaje de error
 */
export function printError(message: string): void {
  console.log(colors.error(`❌ ${message}`));
}

/**
 * Imprime mensaje de advertencia
 */
export function printWarning(message: string): void {
  console.log(colors.warning(`⚠️  ${message}`));
}

/**
 * Imprime mensaje de información
 */
export function printInfo(message: string): void {
  console.log(colors.info(`ℹ️  ${message}`));
}

/**
 * Imprime encabezado
 */
export function printHeader(title: string): void {
  console.log('');
  console.log(colors.highlight('========================================'));
  console.log(colors.highlight(title));
  console.log(colors.highlight('========================================'));
  console.log('');
}

/**
 * Ejecuta un comando con spinner
 */
export async function runWithSpinner<T>(
  message: string,
  task: () => Promise<T>,
  successMessage?: string
): Promise<T> {
  const spinner = ora(message).start();

  try {
    const result = await task();
    spinner.succeed(successMessage || message);
    return result;
  } catch (error) {
    spinner.fail(`${message} - Failed`);
    throw error;
  }
}

/**
 * Ejecuta un comando shell y retorna el output
 */
export async function execCommand(
  command: string,
  args?: string[],
  options?: ExecaOptions
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  try {
    const result = await execa(command, args, {
      shell: true,
      ...options,
    });

    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
    };
  } catch (error: any) {
    return {
      stdout: error.stdout || '',
      stderr: error.stderr || error.message || '',
      exitCode: error.exitCode || 1,
    };
  }
}

/**
 * Ejecuta un comando shell con spinner
 */
export async function execCommandWithSpinner(
  message: string,
  command: string,
  args?: string[],
  options?: ExecaOptions
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return runWithSpinner(message, async () => {
    return execCommand(command, args, options);
  });
}

/**
 * Formatea una duración en formato legible
 */
export function formatTime(startTime: Date, endTime: Date = new Date()): string {
  const duration = intervalToDuration({ start: startTime, end: endTime });

  return formatDuration(duration, {
    format: ['minutes', 'seconds'],
    delimiter: ', ',
  });
}

/**
 * Pausa la ejecución por X milisegundos
 */
export async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Pregunta de confirmación simple
 */
export async function confirm(message: string, defaultValue = false): Promise<boolean> {
  const readline = await import('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise(resolve => {
    const defaultText = defaultValue ? '[Y/n]' : '[y/N]';
    rl.question(colors.info(`${message} ${defaultText}: `), answer => {
      rl.close();

      const normalized = answer.toLowerCase().trim();

      if (normalized === '') {
        resolve(defaultValue);
      } else {
        resolve(normalized === 'y' || normalized === 'yes' || normalized === 's' || normalized === 'si');
      }
    });
  });
}

/**
 * Crea un logger con contexto
 */
export function createLogger(context: string) {
  return {
    success: (message: string) => printSuccess(`[${context}] ${message}`),
    error: (message: string) => printError(`[${context}] ${message}`),
    warning: (message: string) => printWarning(`[${context}] ${message}`),
    info: (message: string) => printInfo(`[${context}] ${message}`),
  };
}

/**
 * Maneja errores de manera consistente
 */
export function handleError(error: unknown, context?: string): never {
  const contextPrefix = context ? `[${context}] ` : '';

  if (error instanceof Error) {
    printError(`${contextPrefix}${error.message}`);

    if (error.stack && process.env.DEBUG) {
      console.error(colors.gray(error.stack));
    }
  } else {
    printError(`${contextPrefix}${String(error)}`);
  }

  process.exit(1);
}

/**
 * Trunca un string largo para display
 */
export function truncate(str: string, maxLength: number = 60): string {
  if (str.length <= maxLength) {
    return str;
  }

  return str.substring(0, maxLength - 3) + '...';
}

/**
 * Formatea bytes a tamaño legible
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Crea una tabla simple para mostrar datos
 */
export function printTable(headers: string[], rows: string[][]): void {
  const columnWidths = headers.map((header, i) => {
    const maxRowWidth = Math.max(...rows.map(row => (row[i] || '').length));
    return Math.max(header.length, maxRowWidth);
  });

  const separator = columnWidths.map(width => '-'.repeat(width + 2)).join('+');
  const headerRow = headers.map((header, i) => ` ${header.padEnd(columnWidths[i])} `).join('|');

  console.log(colors.highlight(separator));
  console.log(colors.highlight(headerRow));
  console.log(colors.highlight(separator));

  rows.forEach(row => {
    const rowStr = row.map((cell, i) => ` ${(cell || '').padEnd(columnWidths[i])} `).join('|');
    console.log(colors.white(rowStr));
  });

  console.log(colors.highlight(separator));
}
