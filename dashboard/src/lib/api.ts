import type {
  ApiResponse,
  DeployConfig,
  ServiceStatus,
  DeploymentRecord,
  DeployedVersionInfo,
  Environment,
} from './types';

const API_BASE = '/api';

async function fetchApi<T>(
  endpoint: string,
  options?: RequestInit
): Promise<ApiResponse<T>> {
  try {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });
    return await response.json();
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

// Config
export async function getConfig(): Promise<ApiResponse<DeployConfig>> {
  return fetchApi<DeployConfig>('/config');
}

export async function updateConfig(
  config: DeployConfig
): Promise<ApiResponse<{ message: string }>> {
  return fetchApi<{ message: string }>('/config', {
    method: 'PUT',
    body: JSON.stringify(config),
  });
}

// Status
export async function getStatus(): Promise<
  ApiResponse<{ services: ServiceStatus[]; timestamp: string }>
> {
  return fetchApi<{ services: ServiceStatus[]; timestamp: string }>('/status');
}

export async function getHealth(): Promise<
  ApiResponse<{ healthy: boolean; timestamp: string }>
> {
  return fetchApi<{ healthy: boolean; timestamp: string }>('/health');
}

export async function getServices(): Promise<ApiResponse<{ services: string[] }>> {
  return fetchApi<{ services: string[] }>('/services');
}

// Deploy
export async function deployAll(options?: {
  env?: Environment;
  skipMigrations?: boolean;
  skipHealthCheck?: boolean;
}): Promise<ApiResponse<{ deploymentId: number; status: string; message: string }>> {
  return fetchApi<{ deploymentId: number; status: string; message: string }>(
    '/deploy/all',
    {
      method: 'POST',
      body: JSON.stringify(options || {}),
    }
  );
}

export async function deployBackend(options?: {
  env?: Environment;
  skipMigrations?: boolean;
  skipHealthCheck?: boolean;
}): Promise<ApiResponse<{ deploymentId: number; status: string; message: string }>> {
  return fetchApi<{ deploymentId: number; status: string; message: string }>(
    '/deploy/backend',
    {
      method: 'POST',
      body: JSON.stringify(options || {}),
    }
  );
}

export async function deployService(
  serviceName: string,
  options?: {
    env?: Environment;
    skipHealthCheck?: boolean;
  }
): Promise<ApiResponse<{ deploymentId: number; status: string; message: string }>> {
  return fetchApi<{ deploymentId: number; status: string; message: string }>(
    `/deploy/service/${serviceName}`,
    {
      method: 'POST',
      body: JSON.stringify(options || {}),
    }
  );
}

// History
export async function getHistory(
  limit = 10,
  env?: Environment
): Promise<ApiResponse<{ deployments: DeploymentRecord[]; total: number }>> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (env) params.set('env', env);
  return fetchApi<{ deployments: DeploymentRecord[]; total: number }>(
    `/history?${params}`
  );
}

export async function getStats(env?: Environment): Promise<
  ApiResponse<{
    total: number;
    success: number;
    failed: number;
    successRate: number;
  }>
> {
  const params = env ? `?env=${env}` : '';
  return fetchApi<{
    total: number;
    success: number;
    failed: number;
    successRate: number;
  }>(`/stats${params}`);
}

// Version
export async function getVersion(): Promise<
  ApiResponse<{ version: DeployedVersionInfo | null; message?: string }>
> {
  return fetchApi<{ version: DeployedVersionInfo | null; message?: string }>(
    '/version'
  );
}
