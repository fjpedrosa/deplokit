import { join } from 'path';
import { existsSync } from 'fs';
import type { DashboardOptions } from './types';
import { handleApiRequest } from './api';
import {
  addClient,
  removeClient,
  startStatusPolling,
  stopStatusPolling,
  getClientCount,
} from './websocket';
import { printSuccess, printInfo, printError, colors } from '../utils';

/**
 * Serve static files from dashboard directory
 */
async function serveStaticFile(pathname: string, basePath: string): Promise<Response> {
  // Default to index.html for root and SPA routes
  let filePath = pathname === '/' ? '/index.html' : pathname;

  // Try the exact path first
  let fullPath = join(basePath, filePath);

  // If file doesn't exist and it's not an API route, serve index.html (SPA fallback)
  if (!existsSync(fullPath) && !pathname.startsWith('/api')) {
    fullPath = join(basePath, 'index.html');
  }

  try {
    const file = Bun.file(fullPath);
    const exists = await file.exists();

    if (!exists) {
      return new Response('Not Found', { status: 404 });
    }

    // Determine content type
    const ext = fullPath.split('.').pop()?.toLowerCase();
    const contentTypes: Record<string, string> = {
      html: 'text/html',
      css: 'text/css',
      js: 'application/javascript',
      json: 'application/json',
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      gif: 'image/gif',
      svg: 'image/svg+xml',
      ico: 'image/x-icon',
      woff: 'font/woff',
      woff2: 'font/woff2',
      ttf: 'font/ttf',
    };

    const contentType = contentTypes[ext || ''] || 'application/octet-stream';

    return new Response(file, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': ext === 'html' ? 'no-cache' : 'public, max-age=31536000',
      },
    });
  } catch (error) {
    console.error('Static file error:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
}

/**
 * Open browser to URL
 */
async function openBrowser(url: string): Promise<void> {
  try {
    const { execa } = await import('execa');
    const platform = process.platform;

    if (platform === 'darwin') {
      await execa('open', [url]);
    } else if (platform === 'win32') {
      await execa('cmd', ['/c', 'start', url]);
    } else {
      await execa('xdg-open', [url]);
    }
  } catch {
    // Silently fail if browser can't be opened
  }
}

/**
 * Find dashboard static files directory
 */
function findDashboardPath(): string | null {
  // Check multiple possible locations
  const possiblePaths = [
    // Development: dist/dashboard in project root
    join(process.cwd(), 'dist', 'dashboard'),
    // Installed package: relative to this file
    join(import.meta.dir, '../../../dist/dashboard'),
    // Alternative: dashboard folder in cwd
    join(process.cwd(), 'dashboard', 'dist'),
  ];

  for (const path of possiblePaths) {
    if (existsSync(join(path, 'index.html'))) {
      return path;
    }
  }

  return null;
}

/**
 * Start the dashboard server
 */
export async function startDashboard(options: DashboardOptions = {}): Promise<void> {
  const port = options.port || 4200;

  // Find dashboard static files
  const dashboardPath = findDashboardPath();

  if (!dashboardPath) {
    printError('Dashboard not found. Build it first with: bun run build:dashboard');
    printInfo('Or run from the deploy-toolkit directory');
    throw new Error('Dashboard files not found');
  }

  printInfo(`Dashboard path: ${dashboardPath}`);

  const server = Bun.serve({
    hostname: '127.0.0.1', // Localhost only for security
    port,

    fetch(req, server) {
      const url = new URL(req.url);

      // WebSocket upgrade
      if (url.pathname === '/ws') {
        const upgraded = server.upgrade(req);
        if (upgraded) {
          return undefined;
        }
        return new Response('WebSocket upgrade failed', { status: 400 });
      }

      // API routes
      if (url.pathname.startsWith('/api/')) {
        return handleApiRequest(req);
      }

      // Static files
      return serveStaticFile(url.pathname, dashboardPath);
    },

    websocket: {
      open(ws) {
        addClient(ws);
        printInfo(`WebSocket client connected (${getClientCount()} total)`);
      },
      message(ws, message) {
        // Handle incoming messages if needed
        // For now, server is push-only
      },
      close(ws) {
        removeClient(ws);
        printInfo(`WebSocket client disconnected (${getClientCount()} total)`);
      },
    },
  });

  // Start status polling
  startStatusPolling();

  console.log('');
  printSuccess(`Dashboard server started!`);
  console.log('');
  console.log(`  ${colors.highlight('Local:')}   http://localhost:${port}`);
  console.log('');
  printInfo('Press Ctrl+C to stop');
  console.log('');

  // Auto-open browser
  if (options.open !== false) {
    await openBrowser(`http://localhost:${port}`);
  }

  // Handle shutdown
  process.on('SIGINT', () => {
    console.log('');
    printInfo('Shutting down dashboard server...');
    stopStatusPolling();
    server.stop();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    stopStatusPolling();
    server.stop();
    process.exit(0);
  });
}

export type { DashboardOptions };
