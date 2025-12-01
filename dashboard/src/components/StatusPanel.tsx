import { Activity, CheckCircle, XCircle, AlertCircle, Loader2 } from 'lucide-react';
import type { ServiceStatus } from '../lib/types';

interface StatusPanelProps {
  services: ServiceStatus[];
  loading: boolean;
  lastUpdated: string | null;
}

function getStatusColor(status: ServiceStatus['status'], health: ServiceStatus['health']) {
  if (status === 'stopped') return 'bg-gray-100 text-gray-600';
  if (health === 'healthy') return 'bg-green-100 text-green-700';
  if (health === 'unhealthy') return 'bg-red-100 text-red-700';
  if (health === 'starting') return 'bg-yellow-100 text-yellow-700';
  return 'bg-gray-100 text-gray-600';
}

function getStatusIcon(status: ServiceStatus['status'], health: ServiceStatus['health']) {
  if (status === 'stopped') return <XCircle className="w-5 h-5" />;
  if (health === 'healthy') return <CheckCircle className="w-5 h-5" />;
  if (health === 'unhealthy') return <XCircle className="w-5 h-5" />;
  if (health === 'starting') return <Loader2 className="w-5 h-5 animate-spin" />;
  return <AlertCircle className="w-5 h-5" />;
}

export function StatusPanel({ services, loading, lastUpdated }: StatusPanelProps) {
  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center gap-2 mb-4">
          <Activity className="w-5 h-5 text-primary-600" />
          <h2 className="text-lg font-semibold">Service Status</h2>
        </div>
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-primary-600" />
          <h2 className="text-lg font-semibold">Service Status</h2>
        </div>
        {lastUpdated && (
          <span className="text-xs text-gray-500">
            Updated: {new Date(lastUpdated).toLocaleTimeString()}
          </span>
        )}
      </div>

      {services.length === 0 ? (
        <p className="text-gray-500 text-center py-4">No services configured</p>
      ) : (
        <div className="grid gap-3">
          {services.map((service) => (
            <div
              key={service.name}
              className={`flex items-center justify-between p-3 rounded-lg ${getStatusColor(
                service.status,
                service.health
              )}`}
            >
              <div className="flex items-center gap-3">
                {getStatusIcon(service.status, service.health)}
                <div>
                  <p className="font-medium">{service.name}</p>
                  <p className="text-xs opacity-75">{service.dockerName}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm font-medium capitalize">{service.status}</p>
                <p className="text-xs opacity-75 capitalize">{service.health}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
