import { useEffect, useState, useCallback } from 'react';
import { Wifi, WifiOff, RefreshCw } from 'lucide-react';
import { StatusPanel } from './components/StatusPanel';
import { DeployPanel } from './components/DeployPanel';
import { VersionInfo } from './components/VersionInfo';
import { HistoryTable } from './components/HistoryTable';
import { useWebSocket } from './hooks/useWebSocket';
import { useStatus } from './hooks/useStatus';
import { getServices, getConfig } from './lib/api';
import type { WebSocketMessage, DeployConfig } from './lib/types';

function App() {
  const [activeServices, setActiveServices] = useState<string[]>([]);
  const [config, setConfig] = useState<DeployConfig | null>(null);
  const { services, loading, lastUpdated, refresh, handleWebSocketMessage } = useStatus();

  const onMessage = useCallback(
    (message: WebSocketMessage) => {
      handleWebSocketMessage(message);

      // Refresh on deploy complete
      if (message.event === 'deploy:complete') {
        setTimeout(refresh, 2000);
      }
    },
    [handleWebSocketMessage, refresh]
  );

  const { connected } = useWebSocket(onMessage);

  useEffect(() => {
    async function loadData() {
      const [servicesRes, configRes] = await Promise.all([
        getServices(),
        getConfig(),
      ]);

      if (servicesRes.success && servicesRes.data) {
        setActiveServices(servicesRes.data.services);
      }

      if (configRes.success && configRes.data) {
        setConfig(configRes.data);
      }
    }
    loadData();
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-gray-900">
                Deploy Toolkit
              </h1>
              {config && (
                <p className="text-sm text-gray-500">
                  {config.project.name} - {config.project.domain}
                </p>
              )}
            </div>

            <div className="flex items-center gap-4">
              <button
                onClick={refresh}
                className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                title="Refresh status"
              >
                <RefreshCw className="w-5 h-5" />
              </button>

              <div
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm ${
                  connected
                    ? 'bg-green-100 text-green-700'
                    : 'bg-red-100 text-red-700'
                }`}
              >
                {connected ? (
                  <>
                    <Wifi className="w-4 h-4" />
                    <span>Connected</span>
                  </>
                ) : (
                  <>
                    <WifiOff className="w-4 h-4" />
                    <span>Disconnected</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Status & Version */}
          <div className="lg:col-span-2 space-y-6">
            <StatusPanel
              services={services}
              loading={loading}
              lastUpdated={lastUpdated}
            />
            <HistoryTable />
          </div>

          {/* Right Column - Deploy & Version */}
          <div className="space-y-6">
            <DeployPanel
              services={activeServices}
              onDeployStart={refresh}
            />
            <VersionInfo />
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t mt-8 py-4">
        <div className="max-w-7xl mx-auto px-4">
          <p className="text-center text-sm text-gray-500">
            Deploy Toolkit Dashboard - Running on localhost
          </p>
        </div>
      </footer>
    </div>
  );
}

export default App;
