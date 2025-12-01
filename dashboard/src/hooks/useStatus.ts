import { useState, useEffect, useCallback } from 'react';
import { getStatus } from '../lib/api';
import type { ServiceStatus, WebSocketMessage } from '../lib/types';

export function useStatus() {
  const [services, setServices] = useState<ServiceStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    const response = await getStatus();
    if (response.success && response.data) {
      setServices(response.data.services);
      setLastUpdated(response.data.timestamp);
      setError(null);
    } else {
      setError(response.error || 'Failed to fetch status');
    }
    setLoading(false);
  }, []);

  // Handle WebSocket status updates
  const handleWebSocketMessage = useCallback((message: WebSocketMessage) => {
    if (message.event === 'status:update') {
      const data = message.data as { services: ServiceStatus[]; timestamp: string };
      setServices(data.services);
      setLastUpdated(data.timestamp);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  return {
    services,
    loading,
    error,
    lastUpdated,
    refresh: fetchStatus,
    handleWebSocketMessage,
  };
}
