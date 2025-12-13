'use client';

import React, { useEffect, useState } from 'react';
import { Node, NodePositionHistoryEntry, NodeTelemetryHistoryEntry, NodeLatencyHistoryEntry, NodePortActivityEntry, NodePortPacketEntry } from '@/types';
import { apiClient } from '@/lib/api';
import NodePositionHistoryMap from './NodePositionHistoryMap';
import NodeTelemetryCharts from './NodeTelemetryCharts';
import NodeLatencyHistoryChart from './NodeLatencyHistoryChart';
import type { ActivityTimeRange } from '@/lib/activityFilters';
import { 
  X, 
  Battery, 
  Thermometer, 
  Gauge, 
  MapPin, 
  Clock,
  Radio,
  Cpu,
  Wifi,
  Droplets,
  Target,
  Signal,
} from 'lucide-react';
import { NodeActionButtons } from './NodeActionButtons';
import { formatLocationSourceLabel } from '@/lib/position';

interface NodeDetailsModalProps {
  node: Node;
  isOpen: boolean;
  onClose: () => void;
  interfaces?: any[];
  onInterfaceClick?: (iface: any) => void;
}

export default function NodeDetailsModal({
  node,
  isOpen,
  onClose,
  interfaces = [],
  onInterfaceClick,
}: NodeDetailsModalProps) {
  const [positionHistory, setPositionHistory] = useState<NodePositionHistoryEntry[]>([]);
  const [isLoadingPositions, setIsLoadingPositions] = useState(false);
  const [positionError, setPositionError] = useState<string | null>(null);
  const [telemetryHistory, setTelemetryHistory] = useState<NodeTelemetryHistoryEntry[]>([]);
  const [isLoadingTelemetry, setIsLoadingTelemetry] = useState(false);
  const [telemetryError, setTelemetryError] = useState<string | null>(null);
  const [telemetryRange, setTelemetryRange] = useState<ActivityTimeRange>('24hours');
  const [latencyHistory, setLatencyHistory] = useState<NodeLatencyHistoryEntry[]>([]);
  const [isLoadingLatencyHistory, setIsLoadingLatencyHistory] = useState(false);
  const [latencyHistoryError, setLatencyHistoryError] = useState<string | null>(null);
  // Custom datetime range filter for latency chart
  // latencySinceLocal / latencyUntilLocal are bound to the input controls (datetime-local)
  // latencySinceApplied / latencyUntilApplied are the values actually used to fetch data
  const [latencySinceLocal, setLatencySinceLocal] = useState<string | null>(null);
  const [latencyUntilLocal, setLatencyUntilLocal] = useState<string | null>(null);
  const [latencySinceApplied, setLatencySinceApplied] = useState<string | null>(null);
  const [latencyUntilApplied, setLatencyUntilApplied] = useState<string | null>(null);
  const [latencyRangeError, setLatencyRangeError] = useState<string | null>(null);

  // helper to format a Date into `datetime-local` input value in local timezone
  const formatForDatetimeLocal = (d: Date) => {
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  // When modal opens, set sensible defaults: since = 1 day ago, until = 24h in future
  useEffect(() => {
    if (!isOpen) return;
    const now = new Date();
    const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const until = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const sinceLocal = formatForDatetimeLocal(since);
    const untilLocal = formatForDatetimeLocal(until);
    setLatencySinceLocal(sinceLocal);
    setLatencyUntilLocal(untilLocal);
    // also apply immediately so the chart loads with that window by default
    setLatencySinceApplied(sinceLocal);
    setLatencyUntilApplied(untilLocal);
    setLatencyRangeError(null);
  }, [isOpen]);
  const [portActivity, setPortActivity] = useState<NodePortActivityEntry[]>([]);
  const [isLoadingPortActivity, setIsLoadingPortActivity] = useState(false);
  const [portActivityError, setPortActivityError] = useState<string | null>(null);
  const [selectedPort, setSelectedPort] = useState<NodePortActivityEntry | null>(null);
  const [portPackets, setPortPackets] = useState<NodePortPacketEntry[]>([]);
  const [isLoadingPortPackets, setIsLoadingPortPackets] = useState(false);
  const [portPacketsError, setPortPacketsError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    let cancelled = false;

    const fetchHistory = async () => {
      setIsLoadingPositions(true);
      setPositionError(null);
      try {
        const response = await apiClient.getNodePositionHistory(node.node_id, { limit: 150 });
        if (!cancelled) {
          setPositionHistory(response.data);
        }
      } catch (error) {
        console.error('Failed to load node position history', error);
        if (!cancelled) {
          setPositionError('Unable to load historical positions');
          setPositionHistory([]);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingPositions(false);
        }
      }
    };

    fetchHistory();

    return () => {
      cancelled = true;
    };
  }, [isOpen, node.node_id]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    let cancelled = false;

    const fetchTelemetry = async () => {
      setIsLoadingTelemetry(true);
      setTelemetryError(null);
      try {
        const params = telemetryRange === 'all'
          ? { limit: 250 }
          : { last: telemetryRange, limit: 250 };
        const response = await apiClient.getNodeTelemetryHistory(node.node_id, params);
        if (!cancelled) {
          setTelemetryHistory(response.data);
        }
      } catch (error) {
        console.error('Failed to load node telemetry history', error);
        if (!cancelled) {
          setTelemetryError('Unable to load telemetry history');
          setTelemetryHistory([]);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingTelemetry(false);
        }
      }
    };

    fetchTelemetry();

    return () => {
      cancelled = true;
    };
  }, [isOpen, node.node_id, telemetryRange]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    let cancelled = false;

    const fetchLatencyHistory = async () => {
      setIsLoadingLatencyHistory(true);
      setLatencyHistoryError(null);
      try {
        // If user provided a custom since/until use those (convert local-datetime to ISO),
        // otherwise fallback to last 7 days.
        const params: { limit?: number; last?: ActivityTimeRange; since?: string; until?: string } = { limit: 300 };
        if (latencySinceApplied || latencyUntilApplied) {
          // use applied values (they should already be validated)
          if (latencySinceApplied) params.since = new Date(latencySinceApplied).toISOString();
          if (latencyUntilApplied) params.until = new Date(latencyUntilApplied).toISOString();
        } else {
          params.last = '7days';
        }

        const response = await apiClient.getNodeLatencyHistory(node.node_id, params);
        if (!cancelled) {
          setLatencyHistory(response.data);
        }
      } catch (error) {
        console.error('Failed to load node latency history', error);
        if (!cancelled) {
          setLatencyHistoryError('Unable to load latency history');
          setLatencyHistory([]);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingLatencyHistory(false);
        }
      }
    };

    fetchLatencyHistory();

    return () => {
      cancelled = true;
    };
  }, [isOpen, node.node_id, latencySinceApplied, latencyUntilApplied]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    let cancelled = false;

    const fetchPortActivity = async () => {
      setIsLoadingPortActivity(true);
      setPortActivityError(null);
      try {
        const response = await apiClient.getNodePortActivity(node.node_id);
        if (!cancelled) {
          setPortActivity(response.data);
          setSelectedPort((current) => {
            if (!current) {
              return current;
            }
            const stillExists = response.data.some((entry) => entry.port === current.port);
            if (!stillExists) {
              setPortPackets([]);
              setPortPacketsError(null);
              return null;
            }
            return current;
          });
        }
      } catch (error) {
        console.error('Failed to load node port activity', error);
        if (!cancelled) {
          setPortActivityError('Unable to load port activity');
          setPortActivity([]);
          setSelectedPort(null);
          setPortPackets([]);
          setPortPacketsError(null);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingPortActivity(false);
        }
      }
    };

    fetchPortActivity();

    return () => {
      cancelled = true;
    };
  }, [isOpen, node.node_id]);

  useEffect(() => {
    if (!isOpen) {
      setSelectedPort(null);
      setPortPackets([]);
      setPortPacketsError(null);
      setIsLoadingPortPackets(false);
      setLatencyHistory([]);
      setLatencyHistoryError(null);
      setIsLoadingLatencyHistory(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !selectedPort) {
      return;
    }

    let cancelled = false;

    const fetchPortPackets = async () => {
      setIsLoadingPortPackets(true);
      setPortPacketsError(null);
      setPortPackets([]);
      try {
        const response = await apiClient.getNodePortPackets(node.node_id, selectedPort.port, { limit: 25 });
        if (!cancelled) {
          setPortPackets(response.data);
        }
      } catch (error) {
        console.error('Failed to load packets for port', error);
        if (!cancelled) {
          setPortPacketsError('Unable to load packets for this port');
          setPortPackets([]);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingPortPackets(false);
        }
      }
    };

    fetchPortPackets();

    return () => {
      cancelled = true;
    };
  }, [isOpen, node.node_id, selectedPort]);

  if (!isOpen) return null;

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

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

  const formatUptime = (seconds?: number) => {
    if (!seconds) return 'N/A';
    
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (days > 0) {
      return `${days}d ${hours}h ${minutes}m`;
    } else if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else {
      return `${minutes}m`;
    }
  };

  const formatPayloadValue = (value: unknown) => {
    if (value === null || value === undefined) {
      return 'N/A';
    }
    if (typeof value === 'number') {
      return Number.isFinite(value) ? String(value) : 'N/A';
    }
    if (typeof value === 'boolean') {
      return value ? 'true' : 'false';
    }
    if (value instanceof Date) {
      return value.toISOString();
    }
    if (typeof value === 'object') {
      try {
        return JSON.stringify(value);
      } catch (error) {
        console.warn('Failed to serialize payload value', error);
        return '[object]';
      }
    }
    return String(value);
  };

  const handlePortClick = (entry: NodePortActivityEntry) => {
    if (selectedPort?.port === entry.port) {
      setSelectedPort(null);
      setPortPackets([]);
      setPortPacketsError(null);
      return;
    }
    setSelectedPort(entry);
  };

  const getBatteryColor = (level?: number) => {
    if (!level) return 'text-gray-400';
    if (level > 75) return 'text-green-600';
    if (level > 50) return 'text-yellow-600';
    if (level > 25) return 'text-orange-600';
    return 'text-red-600';
  };

  const latencyStatusLabel = (() => {
    if (node.latency_reachable === true) {
      return { label: 'Reachable', className: 'text-green-600 font-semibold' };
    }
    if (node.latency_reachable === false) {
      return { label: 'Unreachable', className: 'text-red-600 font-semibold' };
    }
    return { label: 'No recent probe', className: 'text-gray-500' };
  })();

  const latencyLabel = (() => {
    if (node.latency_ms === null || node.latency_ms === undefined) {
      return 'N/A';
    }
    return `${node.latency_ms} ms`;
  })();

  const latencyStatusBadgeClass = (() => {
    if (node.latency_reachable === true) {
      return 'bg-green-100 text-green-700 border border-green-200';
    }
    if (node.latency_reachable === false) {
      return 'bg-red-100 text-red-700 border border-red-200';
    }
    return 'bg-gray-100 text-gray-600 border border-gray-200';
  })();

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 p-3 sm:p-4 pointer-events-none">
      {/* Invisible clickable area to close modal */}
      <div 
        className="absolute inset-0 pointer-events-auto"
        onClick={onClose}
      />
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto pointer-events-auto relative z-10">
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-gray-200">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg sm:text-xl font-bold text-gray-900 truncate">
              {node.short_name && node.long_name 
                ? `${node.short_name} - ${node.long_name}`
                : node.short_name || node.long_name || `${node.node_num}`}
            </h2>
            <p className="text-xs sm:text-sm text-gray-500 truncate">{node.node_id}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${latencyStatusBadgeClass}`}>
                {latencyStatusLabel.label}
              </span>
              <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-gray-100 text-gray-700 border border-gray-200">
                Latency: {latencyLabel}
              </span>
            </div>
            <NodeActionButtons
              nodeId={node.node_id}
              size="sm"
              className="mt-3"
              onBeforeNavigate={onClose}
              currentTabOverride="overview"
            />
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors touch-manipulation flex-shrink-0 ml-2"
            style={{ minWidth: '44px', minHeight: '44px' }}
          >
            <X className="h-5 w-5 text-gray-400" />
          </button>
        </div>

  {/* Content */}
  <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
          {/* Interfaces Section */}
          {interfaces.length > 0 && (
            <div>
              <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-3">Interfaces</h3>
              <div className="space-y-2">
                {interfaces.map((iface: any) => (
                  <div key={iface.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-b-0 hover:bg-gray-50 cursor-pointer"
                    onClick={() => onInterfaceClick?.(iface)}>
                    <span className="text-sm font-medium text-gray-900 truncate" title={iface.display_name}>{iface.display_name || 'Unnamed'}</span>
                    <span className="text-xs text-gray-500 px-2 py-1 bg-gray-100 rounded">{iface.name || 'Unknown'}</span>
                    <span className={`text-xs font-semibold px-2 py-1 rounded ${iface.status === 'RUNNING' ? 'bg-green-100 text-green-700' : iface.status === 'ERROR' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-700'}`}>{iface.status}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {/* Basic Information */}
          <div>
            <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-3">Basic Information</h3>
            <div className="grid grid-cols-1 gap-4">
              <div className="space-y-2">
                <div className="flex items-center">
                  <Cpu className="h-4 w-4 text-gray-400 mr-2" />
                  <span className="text-sm text-gray-600">Node Number:</span>
                  <span className="text-sm font-medium text-gray-900 ml-auto">{node.node_num}</span>
                </div>
                <div className="flex items-center">
                  <Wifi className="h-4 w-4 text-gray-400 mr-2" />
                  <span className="text-sm text-gray-600">Node ID:</span>
                  <span className="text-sm font-medium text-gray-900 ml-auto">{node.node_id}</span>
                </div>
                <div className="flex items-center">
                  <Wifi className="h-4 w-4 text-gray-400 mr-2" />
                  <span className="text-sm text-gray-600">MAC Address:</span>
                  <span className="text-sm font-medium text-gray-900 ml-auto">{node.mac_address}</span>
                </div>
                {node.hw_model && (
                  <div className="flex items-center">
                    <span className="text-sm text-gray-600">Hardware:</span>
                    <span className="text-sm font-medium text-gray-900 ml-auto">{node.hw_model}</span>
                  </div>
                )}
                {node.role && (
                  <div className="flex items-center">
                    <span className="text-sm text-gray-600">Role:</span>
                    <span className="text-sm font-medium text-gray-900 ml-auto capitalize">{node.role}</span>
                  </div>
                )}
              </div>
              
              <div className="space-y-2">
                <div className="flex items-center">
                  <Clock className="h-4 w-4 text-gray-400 mr-2" />
                  <span className="text-sm text-gray-600">First Seen:</span>
                  <span className="text-sm font-medium text-gray-900 ml-auto">
                    {formatTime(node.first_seen)}
                  </span>
                </div>
                <div className="flex items-center">
                  <Clock className="h-4 w-4 text-gray-400 mr-2" />
                  <span className="text-sm text-gray-600">Last Seen:</span>
                  <span className="text-sm font-medium text-gray-900 ml-auto">
                    {formatTime(node.last_seen)}
                  </span>
                </div>
                {node.uptime_seconds && (
                  <div className="flex items-center">
                    <span className="text-sm text-gray-600">Uptime:</span>
                    <span className="text-sm font-medium text-gray-900 ml-auto">
                      {formatUptime(node.uptime_seconds)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Power & Performance */}
          {(node.battery_level || node.voltage || node.channel_utilization || node.air_util_tx) && (
            <div>
              <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-3">Power & Performance</h3>
              <div className="grid grid-cols-1 gap-4">
                {node.battery_level && (
                  <div className="flex items-center">
                    <Battery className={`h-4 w-4 mr-2 ${getBatteryColor(node.battery_level)}`} />
                    <span className="text-sm text-gray-600">Battery Level:</span>
                    <span className={`text-sm font-medium ml-auto ${getBatteryColor(node.battery_level)}`}>
                      {node.battery_level}%
                    </span>
                  </div>
                )}
                {node.voltage && (
                  <div className="flex items-center">
                    <span className="text-sm text-gray-600">Voltage:</span>
                    <span className="text-sm font-medium text-gray-900 ml-auto">{node.voltage}V</span>
                  </div>
                )}
                {node.channel_utilization && (
                  <div className="flex items-center">
                    <Radio className="h-4 w-4 text-gray-400 mr-2" />
                    <span className="text-sm text-gray-600">Channel Util:</span>
                    <span className="text-sm font-medium text-gray-900 ml-auto">{node.channel_utilization}%</span>
                  </div>
                )}
                {node.air_util_tx && (
                  <div className="flex items-center">
                    <span className="text-sm text-gray-600">Air Util TX:</span>
                    <span className="text-sm font-medium text-gray-900 ml-auto">{node.air_util_tx}%</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Location */}
          <div>
            <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-3">Location</h3>
            <div className="space-y-2">
              {node.latitude && node.longitude && (
                <div className="flex items-center">
                  <MapPin className="h-4 w-4 text-gray-400 mr-2" />
                  <span className="text-sm text-gray-600">Current Coordinates:</span>
                  <span className="text-sm font-medium text-gray-900 ml-auto">
                    {node.latitude.toFixed(6)}, {node.longitude.toFixed(6)}
                  </span>
                </div>
              )}
              {node.altitude && (
                <div className="flex items-center">
                  <span className="text-sm text-gray-600">Altitude:</span>
                  <span className="text-sm font-medium text-gray-900 ml-auto">{node.altitude}m</span>
                </div>
              )}
              {node.position_accuracy && (
                <div className="flex items-center">
                  <span className="text-sm text-gray-600">Position Accuracy:</span>
                  <span className="text-sm font-medium text-gray-900 ml-auto">{node.position_accuracy}m</span>
                </div>
              )}
              {node.location_source !== undefined && node.location_source !== null && (
                <div className="flex items-center">
                  <span className="text-sm text-gray-600">Location Source:</span>
                  <span className="text-sm font-medium text-gray-900 ml-auto">{formatLocationSourceLabel(node.location_source)}</span>
                </div>
              )}
            </div>

            <div className="mt-4 space-y-3">
              <h4 className="text-sm font-semibold text-gray-800">Historical Positions</h4>
              {isLoadingPositions ? (
                <div className="flex h-60 items-center justify-center rounded-lg border border-dashed border-gray-300 text-sm text-gray-500">
                  Loading position history…
                </div>
              ) : positionError ? (
                <div className="flex h-60 items-center justify-center rounded-lg border border-dashed border-red-300 bg-red-50 text-sm text-red-600">
                  {positionError}
                </div>
              ) : positionHistory.length > 0 ? (
                <NodePositionHistoryMap positions={positionHistory} />
              ) : (
                <p className="text-sm text-gray-500">No historical position data available.</p>
              )}
            </div>
          </div>

          <div>
            <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-3">Latency</h3>
            {/* Date-time range filter for latency chart */}
            <div className="mb-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-500 mr-1">From</label>
                <input
                  type="datetime-local"
                  value={latencySinceLocal ?? ''}
                  onChange={(e) => setLatencySinceLocal(e.target.value ? e.target.value : null)}
                  className="text-sm border border-gray-300 rounded px-2 py-1"
                />
                <label className="text-xs text-gray-500 ml-2 mr-1">To</label>
                <input
                  type="datetime-local"
                  value={latencyUntilLocal ?? ''}
                  onChange={(e) => setLatencyUntilLocal(e.target.value ? e.target.value : null)}
                  className="text-sm border border-gray-300 rounded px-2 py-1"
                />
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    // Validate inputs
                    setLatencyRangeError(null);
                    if (latencySinceLocal && latencyUntilLocal) {
                      const sinceDate = new Date(latencySinceLocal);
                      const untilDate = new Date(latencyUntilLocal);
                      if (Number.isNaN(sinceDate.getTime()) || Number.isNaN(untilDate.getTime())) {
                        setLatencyRangeError('Invalid date(s)');
                        return;
                      }
                      if (sinceDate > untilDate) {
                        setLatencyRangeError('Start must be before end');
                        return;
                      }
                    }
                    // Apply the local values (may be null)
                    setLatencySinceApplied(latencySinceLocal);
                    setLatencyUntilApplied(latencyUntilLocal);
                  }}
                  className="text-sm bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700"
                >
                  Apply
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setLatencySinceLocal(null);
                    setLatencyUntilLocal(null);
                    setLatencySinceApplied(null);
                    setLatencyUntilApplied(null);
                    setLatencyRangeError(null);
                  }}
                  className="text-sm border border-gray-300 px-3 py-1 rounded bg-white hover:bg-gray-50"
                >
                  Reset
                </button>
              </div>
            </div>

            {latencyRangeError && (
              <p className="text-xs text-red-600 mb-2">{latencyRangeError}</p>
            )}

            <NodeLatencyHistoryChart
              data={latencyHistory}
              isLoading={isLoadingLatencyHistory}
              error={latencyHistoryError}
              currentLatency={node.latency_ms ?? null}
              currentReachable={node.latency_reachable ?? null}
            />
          </div>

          <NodeTelemetryCharts
            data={telemetryHistory}
            isLoading={isLoadingTelemetry}
            error={telemetryError}
            selectedRange={telemetryRange}
            onRangeChange={setTelemetryRange}
          />

          <div>
            <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-3">Port Usage</h3>
            {isLoadingPortActivity ? (
              <div className="flex h-24 items-center justify-center rounded-lg border border-dashed border-gray-300 text-sm text-gray-500">
                Loading port activity…
              </div>
            ) : portActivityError ? (
              <div className="flex h-24 items-center justify-center rounded-lg border border-dashed border-red-300 bg-red-50 text-sm text-red-600">
                {portActivityError}
              </div>
            ) : portActivity.length === 0 ? (
              <p className="text-sm text-gray-500">No packets recorded for this node yet.</p>
            ) : (
              <div className="space-y-3">
                {portActivity.map((entry) => {
                  const isSelected = selectedPort?.port === entry.port;
                  return (
                    <button
                      key={entry.port}
                      type="button"
                      onClick={() => handlePortClick(entry)}
                      aria-pressed={isSelected}
                      className={`w-full text-left rounded-lg border px-3 py-2 transition-colors ${
                        isSelected
                          ? 'border-blue-200 bg-blue-50 shadow-sm'
                          : 'border-gray-100 bg-gray-50 hover:border-blue-200 hover:bg-blue-50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-gray-900">{entry.display_name}</p>
                          <p className="text-xs text-gray-500">{entry.port}</p>
                        </div>
                        <div className="text-right text-xs text-gray-600 space-y-1">
                          <div>
                            <span className="font-semibold text-gray-900">{entry.sent_count}</span> sent
                            <span className="ml-2 text-gray-500">{formatRelativeTime(entry.last_sent)}</span>
                          </div>
                          <div>
                            <span className="font-semibold text-gray-900">{entry.received_count}</span> received
                            <span className="ml-2 text-gray-500">{formatRelativeTime(entry.last_received)}</span>
                          </div>
                        </div>
                      </div>
                      <div className="mt-2 text-xs font-medium text-blue-600">
                        {isSelected ? 'Hide packets' : 'Show packets'}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {selectedPort && (
            <div className="mt-4 space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-gray-800">
                  Recent Packets - {selectedPort.display_name}
                </h4>
                <span className="text-xs text-gray-500">
                  {portPackets.length} shown
                </span>
              </div>
              {isLoadingPortPackets ? (
                <div className="flex h-28 items-center justify-center rounded-lg border border-dashed border-gray-300 text-sm text-gray-500">
                  Loading packets…
                </div>
              ) : portPacketsError ? (
                <div className="flex h-28 items-center justify-center rounded-lg border border-dashed border-red-300 bg-red-50 text-sm text-red-600">
                  {portPacketsError}
                </div>
              ) : portPackets.length === 0 ? (
                <p className="text-sm text-gray-500">No packets recorded for this port yet.</p>
              ) : (
                <div className="max-h-80 overflow-y-auto space-y-2 pr-1">
                  {portPackets.map((packet) => (
                    <div
                      key={`${packet.timestamp}-${packet.packet_id ?? 'np'}-${packet.direction}`}
                      className="rounded-lg border border-gray-200 bg-white p-3 text-xs text-gray-700"
                    >
                      <div className="flex flex-wrap items-center gap-2 text-gray-600">
                        <span className={`font-semibold ${packet.direction === 'sent' ? 'text-blue-600' : 'text-emerald-600'}`}>
                          {packet.direction === 'sent' ? 'Sent' : 'Received'}
                        </span>
                        <span>•</span>
                        <span>{formatTime(packet.timestamp)}</span>
                      </div>
                      <div className="mt-1 text-gray-600">
                        <span className="font-medium text-gray-500">From:</span>{' '}
                        <span className="text-gray-900">{packet.from_node_id ?? 'Unknown'}</span>
                        <span className="mx-1">→</span>
                        <span className="font-medium text-gray-500">To:</span>{' '}
                        <span className="text-gray-900">{packet.to_node_id ?? 'Broadcast'}</span>
                      </div>
                      <div className="mt-2 text-gray-600">
                        {packet.payload?.payload_type && (
                          <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                            {packet.payload.payload_type}
                          </div>
                        )}
                        {packet.payload && Object.keys(packet.payload.fields || {}).length > 0 ? (
                          <div className="space-y-1">
                            {Object.entries(packet.payload.fields).map(([key, value]) => (
                              <div key={key} className="flex items-start justify-between gap-2">
                                <span className="font-medium text-gray-500">{key}</span>
                                <span className="text-gray-900 text-right break-all">{formatPayloadValue(value)}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span className="text-gray-500">No decoded payload details.</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Environmental Sensors */}
          {(node.temperature || node.relative_humidity || node.barometric_pressure || node.gas_resistance || node.iaq) && (
            <div>
              <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-3">Environmental Sensors</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {node.temperature && (
                  <div className="flex items-center">
                    <Thermometer className="h-4 w-4 text-gray-400 mr-2" />
                    <span className="text-sm text-gray-600">Temperature:</span>
                    <span className="text-sm font-medium text-gray-900 ml-auto">{node.temperature}°C</span>
                  </div>
                )}
                {node.relative_humidity && (
                  <div className="flex items-center">
                    <Droplets className="h-4 w-4 text-gray-400 mr-2" />
                    <span className="text-sm text-gray-600">Humidity:</span>
                    <span className="text-sm font-medium text-gray-900 ml-auto">{node.relative_humidity}%</span>
                  </div>
                )}
                {node.barometric_pressure && (
                  <div className="flex items-center">
                    <Gauge className="h-4 w-4 text-gray-400 mr-2" />
                    <span className="text-sm text-gray-600">Pressure:</span>
                    <span className="text-sm font-medium text-gray-900 ml-auto">{node.barometric_pressure} hPa</span>
                  </div>
                )}
                {node.gas_resistance && (
                  <div className="flex items-center">
                    <span className="text-sm text-gray-600">Gas Resistance:</span>
                    <span className="text-sm font-medium text-gray-900 ml-auto">{node.gas_resistance} Ω</span>
                  </div>
                )}
                {node.iaq && (
                  <div className="flex items-center">
                    <span className="text-sm text-gray-600">Air Quality Index:</span>
                    <span className="text-sm font-medium text-gray-900 ml-auto">{node.iaq}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Security */}
          <div>
            <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-3">Security</h3>
            <div className="space-y-2">
              <div className="flex items-center">
                <span className="text-sm text-gray-600">Licensed:</span>
                <span className={`text-sm font-medium ml-auto ${node.is_licensed ? 'text-green-600' : 'text-gray-900'}`}>
                  {node.is_licensed ? 'Yes' : 'No'}
                </span>
              </div>
              {node.is_unmessagable !== undefined && (
                <div className="flex items-center">
                  <span className="text-sm text-gray-600">Messageable:</span>
                  <span className={`text-sm font-medium ml-auto ${!node.is_unmessagable ? 'text-green-600' : 'text-red-600'}`}>
                    {!node.is_unmessagable ? 'Yes' : 'No'}
                  </span>
                </div>
              )}
              {node.public_key && (
                <div className="flex items-start">
                  <span className="text-sm text-gray-600 mt-1">Public Key:</span>
                  <span className="text-xs font-mono text-gray-900 ml-auto max-w-48 break-all">
                    {node.public_key}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 sm:p-6 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onClose}
            className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg hover:bg-blue-700 transition-colors touch-manipulation"
            style={{ minHeight: '44px' }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
