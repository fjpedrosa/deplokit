import { useState } from 'react';
import { Rocket, Server, Layers, Loader2 } from 'lucide-react';
import { deployAll, deployBackend, deployService } from '../lib/api';
import type { Environment } from '../lib/types';

interface DeployPanelProps {
  services: string[];
  onDeployStart?: () => void;
}

export function DeployPanel({ services, onDeployStart }: DeployPanelProps) {
  const [deploying, setDeploying] = useState<string | null>(null);
  const [env, setEnv] = useState<Environment>('production');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleDeploy = async (type: 'all' | 'backend' | string) => {
    setDeploying(type);
    setMessage(null);
    onDeployStart?.();

    try {
      let response;
      if (type === 'all') {
        response = await deployAll({ env });
      } else if (type === 'backend') {
        response = await deployBackend({ env });
      } else {
        response = await deployService(type, { env });
      }

      if (response.success) {
        setMessage({ type: 'success', text: response.data?.message || 'Deployment started' });
      } else {
        setMessage({ type: 'error', text: response.error || 'Deployment failed' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: String(error) });
    } finally {
      setDeploying(null);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center gap-2 mb-4">
        <Rocket className="w-5 h-5 text-primary-600" />
        <h2 className="text-lg font-semibold">Deploy</h2>
      </div>

      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Environment
        </label>
        <select
          value={env}
          onChange={(e) => setEnv(e.target.value as Environment)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          disabled={deploying !== null}
        >
          <option value="development">Development</option>
          <option value="stage">Stage</option>
          <option value="production">Production</option>
        </select>
      </div>

      <div className="grid gap-2">
        <button
          onClick={() => handleDeploy('all')}
          disabled={deploying !== null}
          className="flex items-center justify-center gap-2 w-full px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {deploying === 'all' ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Layers className="w-4 h-4" />
          )}
          Deploy All
        </button>

        <button
          onClick={() => handleDeploy('backend')}
          disabled={deploying !== null}
          className="flex items-center justify-center gap-2 w-full px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {deploying === 'backend' ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Server className="w-4 h-4" />
          )}
          Deploy Backend
        </button>

        {services.length > 0 && (
          <div className="mt-2 pt-2 border-t">
            <p className="text-sm text-gray-600 mb-2">Individual Services</p>
            <div className="grid gap-1">
              {services.map((service) => (
                <button
                  key={service}
                  onClick={() => handleDeploy(service)}
                  disabled={deploying !== null}
                  className="flex items-center justify-between px-3 py-1.5 text-sm bg-gray-50 text-gray-700 rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <span>{service}</span>
                  {deploying === service && (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {message && (
        <div
          className={`mt-4 p-3 rounded-lg text-sm ${
            message.type === 'success'
              ? 'bg-green-100 text-green-700'
              : 'bg-red-100 text-red-700'
          }`}
        >
          {message.text}
        </div>
      )}
    </div>
  );
}
