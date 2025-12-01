export type Environment = 'development' | 'stage' | 'production';
export type DeploymentType = 'full' | 'backend' | 'frontend' | 'service';
export type DeploymentStatus = 'pending' | 'in_progress' | 'success' | 'failed' | 'rolled_back';

export interface ServiceStatus {
  name: string;
  dockerName: string;
  status: 'running' | 'stopped' | 'unhealthy' | 'unknown';
  health: 'healthy' | 'unhealthy' | 'starting' | 'none';
  httpStatus?: number;
}

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

export interface DeployConfig {
  project: {
    name: string;
    domain: string;
  };
  deployment: {
    type: 'local' | 'remote';
    path: string;
    vps_ip?: string;
    ssh_user?: string;
  };
  services: Record<string, boolean | { enabled: boolean; dockerName?: string }>;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface WebSocketMessage {
  event: string;
  data: unknown;
  timestamp: string;
}
