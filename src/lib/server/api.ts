import { loadDeployConfig, findConfigFile, getSSHConfig, getActiveServices } from '../config';
import { deployAll, deployBackend, deployService } from '../actions';
import { getDeploymentHistory, getDeploymentStats } from '../history';
import { runHealthCheck } from '../health-check';
import { getDeployedVersion } from '../version';
import { getServiceStatus, broadcast } from './websocket';
import type {
  ApiResponse,
  DeployRequest,
  DeployResponse,
  HistoryResponse,
  StatsResponse,
  StatusResponse,
} from './types';
import type { Environment } from '../config';

/**
 * JSON response helper
 */
function jsonResponse<T>(data: ApiResponse<T>, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

/**
 * Error response helper
 */
function errorResponse(message: string, status = 500): Response {
  return jsonResponse({ success: false, error: message }, status);
}

/**
 * Parse JSON body safely
 */
async function parseBody<T>(req: Request): Promise<T | null> {
  try {
    return (await req.json()) as T;
  } catch {
    return null;
  }
}

/**
 * Handle API requests
 */
export async function handleApiRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;
  const method = req.method;

  // CORS preflight
  if (method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  try {
    // Config endpoints
    if (path === '/api/config' && method === 'GET') {
      return handleGetConfig();
    }
    if (path === '/api/config' && method === 'PUT') {
      return handleUpdateConfig(req);
    }

    // Status endpoints
    if (path === '/api/status' && method === 'GET') {
      return handleGetStatus();
    }
    if (path === '/api/health' && method === 'GET') {
      return handleGetHealth();
    }
    if (path === '/api/services' && method === 'GET') {
      return handleGetServices();
    }

    // Deploy endpoints
    if (path === '/api/deploy/all' && method === 'POST') {
      return handleDeployAll(req);
    }
    if (path === '/api/deploy/backend' && method === 'POST') {
      return handleDeployBackend(req);
    }
    if (path.startsWith('/api/deploy/service/') && method === 'POST') {
      const serviceName = path.replace('/api/deploy/service/', '');
      return handleDeployService(serviceName, req);
    }

    // History endpoints
    if (path === '/api/history' && method === 'GET') {
      const limit = parseInt(url.searchParams.get('limit') || '10');
      const env = url.searchParams.get('env') as Environment | undefined;
      return handleGetHistory(limit, env);
    }
    if (path === '/api/stats' && method === 'GET') {
      const env = url.searchParams.get('env') as Environment | undefined;
      return handleGetStats(env);
    }

    // Version endpoint
    if (path === '/api/version' && method === 'GET') {
      return handleGetVersion();
    }

    return errorResponse('Not found', 404);
  } catch (error) {
    console.error('API Error:', error);
    return errorResponse(String(error), 500);
  }
}

/**
 * GET /api/config - Get current configuration
 */
function handleGetConfig(): Response {
  try {
    const config = loadDeployConfig();
    return jsonResponse({ success: true, data: config });
  } catch (error) {
    return errorResponse(`Failed to load config: ${error}`);
  }
}

/**
 * PUT /api/config - Update configuration
 */
async function handleUpdateConfig(req: Request): Promise<Response> {
  try {
    const body = await parseBody<Record<string, unknown>>(req);
    if (!body) {
      return errorResponse('Invalid JSON body', 400);
    }

    const configPath = findConfigFile();
    if (!configPath) {
      return errorResponse('Config file not found', 404);
    }

    // Validate required fields
    if (!body.project || !body.deployment) {
      return errorResponse('Missing required fields: project, deployment', 400);
    }

    // Write config file
    await Bun.write(configPath, JSON.stringify(body, null, 2));

    return jsonResponse({ success: true, data: { message: 'Config updated' } });
  } catch (error) {
    return errorResponse(`Failed to update config: ${error}`);
  }
}

/**
 * GET /api/status - Get container status
 */
async function handleGetStatus(): Promise<Response> {
  try {
    const services = await getServiceStatus();
    const response: StatusResponse = {
      services,
      timestamp: new Date().toISOString(),
    };
    return jsonResponse({ success: true, data: response });
  } catch (error) {
    return errorResponse(`Failed to get status: ${error}`);
  }
}

/**
 * GET /api/health - Run health check
 */
async function handleGetHealth(): Promise<Response> {
  try {
    const config = loadDeployConfig();
    const sshConfig = getSSHConfig(config);

    const healthy = await runHealthCheck(config, {
      remote: sshConfig
        ? {
            path: config.deployment.path,
            ssh: {
              target: sshConfig.target,
              sshKey: config.deployment.ssh_key,
            },
          }
        : undefined,
    });

    return jsonResponse({
      success: true,
      data: { healthy, timestamp: new Date().toISOString() },
    });
  } catch (error) {
    return errorResponse(`Failed to run health check: ${error}`);
  }
}

/**
 * GET /api/services - Get list of active services
 */
function handleGetServices(): Response {
  try {
    const config = loadDeployConfig();
    const services = getActiveServices(config);
    return jsonResponse({ success: true, data: { services } });
  } catch (error) {
    return errorResponse(`Failed to get services: ${error}`);
  }
}

/**
 * POST /api/deploy/all - Deploy all
 */
async function handleDeployAll(req: Request): Promise<Response> {
  try {
    const body = await parseBody<DeployRequest>(req);

    broadcast('deploy:start', { type: 'all', timestamp: new Date().toISOString() });

    // Run deploy in background (non-blocking)
    deployAll({
      env: body?.env || 'production',
      skipMigrations: body?.skipMigrations,
      skipHealthCheck: body?.skipHealthCheck,
      skipValidations: body?.skipValidations,
    })
      .then(() => {
        broadcast('deploy:complete', { success: true, type: 'all' });
      })
      .catch((error) => {
        broadcast('deploy:complete', { success: false, type: 'all', error: String(error) });
      });

    const response: DeployResponse = {
      deploymentId: 0, // Will be set by deploy function
      status: 'started',
      message: 'Full deployment started',
    };

    return jsonResponse({ success: true, data: response });
  } catch (error) {
    return errorResponse(`Failed to start deployment: ${error}`);
  }
}

/**
 * POST /api/deploy/backend - Deploy backend
 */
async function handleDeployBackend(req: Request): Promise<Response> {
  try {
    const body = await parseBody<DeployRequest>(req);

    broadcast('deploy:start', { type: 'backend', timestamp: new Date().toISOString() });

    // Run deploy in background (non-blocking)
    deployBackend({
      env: body?.env || 'production',
      skipMigrations: body?.skipMigrations,
      skipHealthCheck: body?.skipHealthCheck,
      skipValidations: body?.skipValidations,
    })
      .then(() => {
        broadcast('deploy:complete', { success: true, type: 'backend' });
      })
      .catch((error) => {
        broadcast('deploy:complete', { success: false, type: 'backend', error: String(error) });
      });

    const response: DeployResponse = {
      deploymentId: 0,
      status: 'started',
      message: 'Backend deployment started',
    };

    return jsonResponse({ success: true, data: response });
  } catch (error) {
    return errorResponse(`Failed to start deployment: ${error}`);
  }
}

/**
 * POST /api/deploy/service/:name - Deploy specific service
 */
async function handleDeployService(serviceName: string, req: Request): Promise<Response> {
  try {
    const body = await parseBody<DeployRequest>(req);

    broadcast('deploy:start', {
      type: 'service',
      service: serviceName,
      timestamp: new Date().toISOString(),
    });

    // Run deploy in background (non-blocking)
    deployService(serviceName, {
      env: body?.env || 'production',
      skipHealthCheck: body?.skipHealthCheck,
      skipValidations: body?.skipValidations,
    })
      .then(() => {
        broadcast('deploy:complete', { success: true, type: 'service', service: serviceName });
      })
      .catch((error) => {
        broadcast('deploy:complete', {
          success: false,
          type: 'service',
          service: serviceName,
          error: String(error),
        });
      });

    const response: DeployResponse = {
      deploymentId: 0,
      status: 'started',
      message: `Service '${serviceName}' deployment started`,
    };

    return jsonResponse({ success: true, data: response });
  } catch (error) {
    return errorResponse(`Failed to start deployment: ${error}`);
  }
}

/**
 * GET /api/history - Get deployment history
 */
function handleGetHistory(limit: number, env?: Environment): Response {
  try {
    const deployments = getDeploymentHistory(limit, env);
    const response: HistoryResponse = {
      deployments,
      total: deployments.length,
    };
    return jsonResponse({ success: true, data: response });
  } catch (error) {
    return errorResponse(`Failed to get history: ${error}`);
  }
}

/**
 * GET /api/stats - Get deployment statistics
 */
function handleGetStats(env?: Environment): Response {
  try {
    const stats = getDeploymentStats(env);
    const response: StatsResponse = stats;
    return jsonResponse({ success: true, data: response });
  } catch (error) {
    return errorResponse(`Failed to get stats: ${error}`);
  }
}

/**
 * GET /api/version - Get deployed version from VPS
 */
async function handleGetVersion(): Promise<Response> {
  try {
    const config = loadDeployConfig();
    const sshConfig = getSSHConfig(config);

    if (!sshConfig || config.deployment.type !== 'remote') {
      return jsonResponse({
        success: true,
        data: { version: null, message: 'Version tracking only available for remote deployments' },
      });
    }

    const version = await getDeployedVersion(config.deployment.path, {
      target: sshConfig.target,
      sshKey: config.deployment.ssh_key,
    });

    return jsonResponse({ success: true, data: { version } });
  } catch (error) {
    return errorResponse(`Failed to get version: ${error}`);
  }
}
