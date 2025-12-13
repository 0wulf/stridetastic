'use client';

import React, { useEffect, useState } from 'react';
import { PlugZap, X, Users, Clock, ArrowUpRight } from 'lucide-react';
import { PortActivityEntry, PortNodeActivityEntry } from '@/types';
import { apiClient } from '@/lib/api';

interface PortDetailsModalProps {
  port: PortActivityEntry;
  isOpen: boolean;
  onClose: () => void;
}

export default function PortDetailsModal({ port, isOpen, onClose }: PortDetailsModalProps) {
  const [nodeActivity, setNodeActivity] = useState<PortNodeActivityEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setNodeActivity([]);
      setError(null);
      return;
    }

    let cancelled = false;

    const fetchNodeActivity = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await apiClient.getPortNodeActivity(port.port);
        if (!cancelled) {
          setNodeActivity(response.data);
        }
      } catch (fetchError) {
        console.error('Failed to load port node activity', fetchError);
        if (!cancelled) {
          setError('Unable to load node activity for this port');
          setNodeActivity([]);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    fetchNodeActivity();

    return () => {
      cancelled = true;
    };
  }, [isOpen, port.port]);

  if (!isOpen) {
    return null;
  }

  const formatRelativeTime = (timestamp?: string | null) => {
    if (!timestamp) {
      return 'Never';
    }
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) {
      return 'Unknown';
    }
    const diffMs = Date.now() - date.getTime();
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    if (diffMinutes < 1) {
      return 'Just now';
    }
    if (diffMinutes < 60) {
      return `${diffMinutes}m ago`;
    }
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) {
      return `${diffHours}h ago`;
    }
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  };

  const getNodeLabel = (entry: PortNodeActivityEntry) => {
    if (entry.short_name && entry.long_name) {
      return `${entry.short_name} - ${entry.long_name}`;
    }
    if (entry.short_name) {
      return entry.short_name;
    }
    if (entry.long_name) {
      return entry.long_name;
    }
    return entry.node_id;
  };

  const totalNodes = nodeActivity.length;
  const totalPackets = nodeActivity.reduce((accum, entry) => accum + entry.total_packets, 0);

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 p-3 sm:p-4 pointer-events-none">
      <div className="absolute inset-0 pointer-events-auto" onClick={onClose} />
      <div className="bg-white rounded-lg shadow-xl max-w-xl w-full max-h-[85vh] overflow-y-auto pointer-events-auto relative z-10">
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-gray-200">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-10 w-10 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
              <PlugZap className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg sm:text-xl font-bold text-gray-900 truncate">{port.display_name}</h2>
              <p className="text-xs sm:text-sm text-gray-500 truncate">{port.port}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            type="button"
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors touch-manipulation"
            style={{ minWidth: '44px', minHeight: '44px' }}
            aria-label="Close port details"
          >
            <X className="h-5 w-5 text-gray-400" />
          </button>
        </div>

        <div className="p-4 sm:p-6 space-y-4 sm:space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Sending Nodes</p>
              <p className="text-2xl font-bold text-gray-900">{totalNodes}</p>
            </div>
            <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Sent Packets</p>
              <p className="text-2xl font-bold text-gray-900">{totalPackets}</p>
            </div>
            <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Last Seen</p>
              <p className="text-sm font-medium text-gray-900">{formatRelativeTime(port.last_seen)}</p>
            </div>
          </div>

          {isLoading ? (
            <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-gray-300 text-sm text-gray-500">
              Loading node activity...
            </div>
          ) : error ? (
            <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-red-300 bg-red-50 text-sm text-red-600">
              {error}
            </div>
          ) : totalNodes === 0 ? (
            <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-gray-300 text-sm text-gray-500">
              No node activity recorded for this port yet.
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs font-medium uppercase tracking-wide text-gray-500">
                <span className="flex items-center gap-2">
                  <Users className="h-4 w-4" /> Nodes
                </span>
                <span className="flex items-center gap-2">
                  <Clock className="h-4 w-4" /> Activity
                </span>
              </div>
              <div className="max-h-80 overflow-y-auto pr-1 space-y-2 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100">
                {nodeActivity.map((entry) => {
                  const totalCount = entry.total_packets;
                  return (
                    <div key={entry.node_id} className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-900 truncate">{getNodeLabel(entry)}</p>
                          <p className="text-xs text-gray-500 truncate">{entry.node_id}</p>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                          <ArrowUpRight className="h-4 w-4 text-blue-500" />
                          <span>{totalCount} packets</span>
                        </div>
                      </div>
                      <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs text-gray-600">
                        <div className="rounded bg-blue-50 px-2 py-1 text-blue-700">
                          <span className="font-semibold text-blue-800">{entry.sent_count}</span> packets sent
                        </div>
                        <div className="rounded bg-gray-100 px-2 py-1 text-gray-700">
                          Last sent: {formatRelativeTime(entry.last_sent)}
                        </div>
                        <div className="rounded bg-gray-100 px-2 py-1 text-gray-700">
                          Node number: {entry.node_num ?? 'N/A'}
                        </div>
                      </div>
                      <div className="mt-2 text-[11px] uppercase tracking-wide text-gray-500">
                        Last activity: {formatRelativeTime(entry.last_activity || entry.last_sent)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
