'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, RefreshCw, ShieldAlert } from 'lucide-react';

import { apiClient } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { NodeKeyHealthEntry } from '@/types';

const resolveNodeLabel = (entry: NodeKeyHealthEntry): string => {
  return entry.short_name || entry.long_name || entry.node_id;
};

export default function KeyHealthPanel() {
  const [entries, setEntries] = useState<NodeKeyHealthEntry[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await apiClient.getNodeKeyHealth();
      const sortedEntries = [...response.data].sort((a, b) => {
        const keyA = a.public_key ?? '';
        const keyB = b.public_key ?? '';
        if (!keyA && !keyB) return 0;
        if (!keyA) return 1;
        if (!keyB) return -1;
        return keyA.localeCompare(keyB);
      });
      setEntries(sortedEntries);
    } catch (err) {
      const maybeResponse = (err as any)?.response?.data;
      if (maybeResponse?.message) {
        setError(String(maybeResponse.message));
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to load key health data');
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const lowEntropyTotal = useMemo(
    () => entries.filter((entry) => entry.is_low_entropy_public_key).length,
    [entries]
  );

  const duplicateNodeTotal = useMemo(
    () => entries.filter((entry) => entry.duplicate_count > 1).length,
    [entries]
  );

  const duplicateKeyGroups = useMemo(() => {
    const unique = new Set<string>();
    entries.forEach((entry) => {
      if (entry.public_key && entry.duplicate_count > 1) {
        unique.add(entry.public_key);
      }
    });
    return unique.size;
  }, [entries]);

  const renderTableBody = () => {
    if (isLoading) {
      return (
        <tr>
          <td colSpan={7} className="px-4 py-10 text-center text-gray-500">
            Loading key health data...
          </td>
        </tr>
      );
    }

    if (error) {
      return (
        <tr>
          <td colSpan={7} className="px-4 py-10 text-center text-red-600">
            {error}
          </td>
        </tr>
      );
    }

    if (!entries.length) {
      return (
        <tr>
          <td colSpan={7} className="px-4 py-10 text-center text-gray-500">
            No low-entropy or duplicate keys detected in the selected timeframe.
          </td>
        </tr>
      );
    }

    return entries.map((entry) => {
      const duplicatePeers = entry.duplicate_node_ids.length
        ? entry.duplicate_node_ids.join(', ')
        : '—';
      return (
        <tr key={entry.node_id} className="border-t border-gray-100">
          <td className="px-4 py-3 text-sm font-medium text-gray-900">
            <div>{resolveNodeLabel(entry)}</div>
            <div className="text-xs text-gray-500">{entry.node_id}</div>
          </td>
          <td className="px-4 py-3 text-sm text-gray-900">
            {entry.public_key ? (
              <code className="break-all rounded bg-gray-50 px-2 py-1 text-xs text-gray-700">
                {entry.public_key}
              </code>
            ) : (
              <span className="text-gray-400">No key</span>
            )}
          </td>
          <td className="px-4 py-3 text-sm">
            <div className="flex flex-wrap gap-2">
              {entry.is_low_entropy_public_key && (
                <span className="inline-flex items-center rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-700">
                  <ShieldAlert className="mr-1 h-3 w-3" />
                  Low entropy
                </span>
              )}
              {entry.duplicate_count > 1 && (
                <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700">
                  <AlertTriangle className="mr-1 h-3 w-3" />
                  Duplicate ({entry.duplicate_count})
                </span>
              )}
            </div>
          </td>
          <td className="px-4 py-3 text-sm text-gray-900">
            {entry.duplicate_count > 1 ? entry.duplicate_count : '—'}
          </td>
          <td className="px-4 py-3 text-sm text-gray-900">{duplicatePeers}</td>
          <td className="px-4 py-3 text-sm text-gray-900">{entry.is_virtual ? 'Virtual' : 'Physical'}</td>
          <td className="px-4 py-3 text-sm text-gray-500">
            <div>Last seen: {formatDate(entry.last_seen)}</div>
            <div className="text-xs">First seen: {formatDate(entry.first_seen)}</div>
          </td>
        </tr>
      );
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Node Key Health</h1>
          <p className="text-sm text-gray-500">
            Monitor low-entropy keys and duplicate public keys in the mesh to spot risky identities quickly.
          </p>
        </div>
        <button
          onClick={() => void loadData()}
          className="inline-flex items-center justify-center rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
          disabled={isLoading}
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-gray-500">Flagged nodes</p>
          <p className="mt-1 text-2xl font-semibold text-gray-900">{entries.length}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-gray-500">Low entropy keys</p>
          <p className="mt-1 text-2xl font-semibold text-red-600">{lowEntropyTotal}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-gray-500">Nodes with duplicates</p>
          <p className="mt-1 text-2xl font-semibold text-amber-600">{duplicateNodeTotal}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-gray-500">Duplicate key groups</p>
          <p className="mt-1 text-2xl font-semibold text-gray-900">{duplicateKeyGroups}</p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Node</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Public Key</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Flags</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Duplicate Count</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Duplicate Nodes</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Type</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Activity</th>
            </tr>
          </thead>
          <tbody className="bg-white">{renderTableBody()}</tbody>
        </table>
      </div>
    </div>
  );
}
