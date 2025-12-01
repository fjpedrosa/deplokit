import type { ServerWebSocket } from 'bun';
import type { WebSocketEventType, WebSocketMessage, ServiceStatus } from './types';
import { loadDeployConfig, getSSHConfig, getActiveServices } from '../config';
import { executeRemoteCommand } from '../ssh';

/**
 * Connected WebSocket clients
 */
const clients = new Set<ServerWebSocket<unknown>>();

/**
 * Status polling interval (ms)
 */
const STATUS_POLL_INTERVAL = 5000;

/**
 * Status polling timer
 */
let statusPollingTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Add a client to the set
 */
export function addClient(ws: ServerWebSocket<unknown>): void {
  clients.add(ws);
}

/**
 * Remove a client from the set
 */
export function removeClient(ws: ServerWebSocket<unknown>): void {
  clients.delete(ws);
}

/**
 * Get connected client count
 */
export function getClientCount(): number {
  return clients.size;
}

/**
 * Broadcast a message to all connected clients
 */
export function broadcast(event: WebSocketEventType, data: unknown): void {
  const message: WebSocketMessage = {
    event,
    data,
    timestamp: new Date().toISOString(),
  };

  const json = JSON.stringify(message);

  for (const client of clients) {
    try {
      client.send(json);
    } catch {
      // Client disconnected, remove from set
      clients.delete(client);
    }
  }
}

/**
 * Send a message to a specific client
 */
export function sendToClient(
  ws: ServerWebSocket<unknown>,
  event: WebSocketEventType,
  data: unknown
): void {
  const message: WebSocketMessage = {
    event,
    data,
    timestamp: new Date().toISOString(),
  };

  try {
    ws.send(JSON.stringify(message));
  } catch {
    clients.delete(ws);
  }
}

/**
 * Query service status from VPS
 */
async function queryServiceStatus(): Promise<ServiceStatus[]> {
  try {
    const config = loadDeployConfig();
    const sshConfig = getSSHConfig(config);

    if (!sshConfig || config.deployment.type !== 'remote') {
      return [];
    }

    const sshOptions = {
      target: sshConfig.target,
      sshKey: config.deployment.ssh_key,
    };

    // Get container status via docker compose
    const result = await executeRemoteCommand(
      `cd ${config.deployment.path}/packages/backend && docker compose ps --format json 2>/dev/null || echo '[]'`,
      sshOptions
    );

    if (!result.stdout.trim() || result.stdout.trim() === '[]') {
      return [];
    }

    // Parse docker compose ps output (one JSON object per line)
    const lines = result.stdout.trim().split('\n');
    const containers: Array<{
      Name: string;
      State: string;
      Health: string;
      Status: string;
    }> = [];

    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);
        containers.push(parsed);
      } catch {
        // Skip invalid JSON lines
      }
    }

    const activeServices = getActiveServices(config);
    const projectName = config.project.name;

    return activeServices.map((serviceName) => {
      const dockerName = `${projectName}-${serviceName.replace(/_/g, '-')}`;
      const container = containers.find(
        (c) => c.Name.includes(dockerName) || c.Name.includes(serviceName)
      );

      if (!container) {
        return {
          name: serviceName,
          dockerName,
          status: 'stopped' as const,
          health: 'none' as const,
        };
      }

      const status =
        container.State === 'running'
          ? 'running'
          : container.State === 'exited'
          ? 'stopped'
          : 'unknown';

      const health =
        container.Health === 'healthy'
          ? 'healthy'
          : container.Health === 'unhealthy'
          ? 'unhealthy'
          : container.Health === 'starting'
          ? 'starting'
          : 'none';

      return {
        name: serviceName,
        dockerName: container.Name,
        status: status as 'running' | 'stopped' | 'unhealthy' | 'unknown',
        health: health as 'healthy' | 'unhealthy' | 'starting' | 'none',
      };
    });
  } catch (error) {
    console.error('Failed to query service status:', error);
    return [];
  }
}

/**
 * Start status polling (broadcasts to all clients)
 */
export function startStatusPolling(): void {
  if (statusPollingTimer) {
    return;
  }

  statusPollingTimer = setInterval(async () => {
    if (clients.size === 0) {
      return;
    }

    const services = await queryServiceStatus();
    broadcast('status:update', {
      services,
      timestamp: new Date().toISOString(),
    });
  }, STATUS_POLL_INTERVAL);
}

/**
 * Stop status polling
 */
export function stopStatusPolling(): void {
  if (statusPollingTimer) {
    clearInterval(statusPollingTimer);
    statusPollingTimer = null;
  }
}

/**
 * Get current service status (one-time query)
 */
export async function getServiceStatus(): Promise<ServiceStatus[]> {
  return queryServiceStatus();
}
