import { useEffect, useState } from 'react';
import { History, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { getHistory } from '../lib/api';
import type { DeploymentRecord } from '../lib/types';
import { format } from 'date-fns';

export function HistoryTable() {
  const [deployments, setDeployments] = useState<DeploymentRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchHistory() {
      const response = await getHistory(15);
      if (response.success && response.data) {
        setDeployments(response.data.deployments);
      }
      setLoading(false);
    }
    fetchHistory();
  }, []);

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center gap-2 mb-4">
          <History className="w-5 h-5 text-primary-600" />
          <h2 className="text-lg font-semibold">Deployment History</h2>
        </div>
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-primary-600" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center gap-2 mb-4">
        <History className="w-5 h-5 text-primary-600" />
        <h2 className="text-lg font-semibold">Deployment History</h2>
      </div>

      {deployments.length === 0 ? (
        <p className="text-gray-500 text-center py-4">No deployment history</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b">
                <th className="pb-2 font-medium text-gray-600">ID</th>
                <th className="pb-2 font-medium text-gray-600">Date</th>
                <th className="pb-2 font-medium text-gray-600">Type</th>
                <th className="pb-2 font-medium text-gray-600">Commit</th>
                <th className="pb-2 font-medium text-gray-600">Status</th>
                <th className="pb-2 font-medium text-gray-600">Duration</th>
              </tr>
            </thead>
            <tbody>
              {deployments.map((d) => (
                <tr key={d.id} className="border-b last:border-0">
                  <td className="py-2 text-gray-500">#{d.id}</td>
                  <td className="py-2">
                    {format(new Date(d.timestamp), 'MM/dd HH:mm')}
                  </td>
                  <td className="py-2">
                    <span className="capitalize">{d.type}</span>
                    {d.service && (
                      <span className="text-gray-500 ml-1">({d.service})</span>
                    )}
                  </td>
                  <td className="py-2 font-mono text-xs">
                    {d.commit_hash || '-'}
                  </td>
                  <td className="py-2">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                        d.status === 'success'
                          ? 'bg-green-100 text-green-700'
                          : d.status === 'failed'
                          ? 'bg-red-100 text-red-700'
                          : d.status === 'in_progress'
                          ? 'bg-yellow-100 text-yellow-700'
                          : 'bg-gray-100 text-gray-700'
                      }`}
                    >
                      {d.status === 'success' && <CheckCircle className="w-3 h-3" />}
                      {d.status === 'failed' && <XCircle className="w-3 h-3" />}
                      {d.status === 'in_progress' && (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      )}
                      {d.status}
                    </span>
                  </td>
                  <td className="py-2 text-gray-500">
                    {d.duration ? `${d.duration}s` : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
