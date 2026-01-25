import React, { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api';
import type { Interface } from '@/types/interface';

export default function InterfacesPanel() {
  const [interfaces, setInterfaces] = useState<Interface[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiClient.getInterfaces().then(res => {
      setInterfaces(res.data);
      setLoading(false);
    });
  }, []);

  if (loading) return <div className="p-4 text-gray-500">Loading interfaces…</div>;
  if (!interfaces.length) return <div className="p-4 text-gray-500">No interfaces found.</div>;

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Interfaces</h2>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm text-gray-900">
          <thead>
            <tr className="bg-gray-50">
              <th className="px-3 py-2 text-left font-medium">Name</th>
              <th className="px-3 py-2 text-left font-medium">Type</th>
              <th className="px-3 py-2 text-left font-medium">Status</th>
              <th className="px-3 py-2 text-left font-medium">Topic</th>
              <th className="px-3 py-2 text-left font-medium">Last Connected</th>
              <th className="px-3 py-2 text-left font-medium">Error</th>
            </tr>
          </thead>
          <tbody>
            {interfaces.map(i => (
              <tr key={i.id} className="border-b last:border-b-0">
                <td className="px-3 py-2 font-semibold whitespace-nowrap">{i.name}</td>
                <td className="px-3 py-2 whitespace-nowrap">{i.interface_type}</td>
                <td className={`px-3 py-2 whitespace-nowrap font-bold ${i.status === 'RUNNING' ? 'text-green-600' : i.status === 'ERROR' ? 'text-red-600' : 'text-gray-700'}`}>{i.status}</td>
                <td className="px-3 py-2 whitespace-nowrap">{i.mqtt_topic ?? '-'}</td>
                <td className="px-3 py-2 whitespace-nowrap">{i.last_connected ? new Date(i.last_connected).toLocaleString() : '-'}</td>
                <td className="px-3 py-2 whitespace-nowrap text-red-600">{i.last_error ?? '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
