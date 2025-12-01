import type { Environment } from '../config';
import type { DeploymentRecord, DeploymentType } from '../history';
import type { DeployedVersionInfo } from '../version';

/**
 * Dashboard server options
 */
export interface DashboardOptions {
  port?: number;
  open?: boolean;
}

/**
 * API Response wrapper
 */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Service status from health check
 */
export interface ServiceStatus {
  name: string;
  dockerName: string;
  status: 'running' | 'stopped' | 'unhealthy' | 'unknown';
  health: 'healthy' | 'unhealthy' | 'starting' | 'none';
  httpStatus?: number;
}

/**
 * Status response
 */
export interface StatusResponse {
  services: ServiceStatus[];
  timestamp: string;
}

/**
 * Deploy request body
 */
export interface DeployRequest {
  env?: Environment;
  skipMigrations?: boolean;
  skipHealthCheck?: boolean;
  skipValidations?: boolean;
}

/**
 * Deploy response
 */
export interface DeployResponse {
  deploymentId: number;
  status: 'started' | 'completed' | 'failed';
  message?: string;
}

/**
 * History response
 */
export interface HistoryResponse {
  deployments: DeploymentRecord[];
  total: number;
}

/**
 * Stats response
 */
export interface StatsResponse {
  total: number;
  success: number;
  failed: number;
  successRate: number;
}

/**
 * WebSocket event types
 */
export type WebSocketEventType =
  | 'status:update'
  | 'deploy:start'
  | 'deploy:progress'
  | 'deploy:output'
  | 'deploy:complete';

/**
 * WebSocket message
 */
export interface WebSocketMessage {
  event: WebSocketEventType;
  data: unknown;
  timestamp: string;
}

/**
 * Deploy progress event data
 */
export interface DeployProgressData {
  step: string;
  current: number;
  total: number;
}

/**
 * Deploy output event data
 */
export interface DeployOutputData {
  line: string;
  type: 'stdout' | 'stderr' | 'info';
}

/**
 * Deploy complete event data
 */
export interface DeployCompleteData {
  success: boolean;
  deploymentId: number;
  duration: number;
  error?: string;
}
