import { useEffect, useState } from 'react';
import { GitBranch, Clock, User, Server, Loader2 } from 'lucide-react';
import { getVersion } from '../lib/api';
import type { DeployedVersionInfo } from '../lib/types';
import { format } from 'date-fns';

export function VersionInfo() {
  const [version, setVersion] = useState<DeployedVersionInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchVersion() {
      const response = await getVersion();
      if (response.success && response.data?.version) {
        setVersion(response.data.version);
      } else if (response.data?.message) {
        setError(response.data.message);
      }
      setLoading(false);
    }
    fetchVersion();
  }, []);

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold mb-4">Deployed Version</h2>
        <div className="flex items-center justify-center py-4">
          <Loader2 className="w-6 h-6 animate-spin text-primary-600" />
        </div>
      </div>
    );
  }

  if (error || !version) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold mb-4">Deployed Version</h2>
        <p className="text-gray-500 text-sm">
          {error || 'No version information available'}
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-lg font-semibold mb-4">Deployed Version</h2>

      <div className="space-y-3">
        <div className="flex items-start gap-3">
          <GitBranch className="w-4 h-4 mt-0.5 text-gray-500" />
          <div>
            <p className="text-sm font-medium text-gray-900 font-mono">
              {version.commitHash}
            </p>
            {version.commitMessage && (
              <p className="text-xs text-gray-500 truncate max-w-[200px]">
                {version.commitMessage}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Clock className="w-4 h-4 text-gray-500" />
          <div>
            <p className="text-sm text-gray-900">
              {format(new Date(version.timestamp), 'MMM dd, yyyy HH:mm')}
            </p>
            {version.duration && (
              <p className="text-xs text-gray-500">{version.duration}s deploy time</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <User className="w-4 h-4 text-gray-500" />
          <p className="text-sm text-gray-900">{version.user}</p>
        </div>

        <div className="flex items-center gap-3">
          <Server className="w-4 h-4 text-gray-500" />
          <div>
            <p className="text-sm text-gray-900 capitalize">{version.environment}</p>
            <p className="text-xs text-gray-500">
              {version.services.join(', ')}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
