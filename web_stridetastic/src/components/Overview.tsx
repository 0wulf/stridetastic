'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiClient } from '@/lib/api';
import { Node, Channel, PortActivityEntry, OverviewMetricSnapshot } from '@/types';
import type { Interface } from '@/types/interface';
import { getNodeActivityColor } from '@/lib/networkTransforms';
import NodeDetailsModal from './NodeDetailsModal';
import ChannelDetailsModal from './ChannelDetailsModal';
import InterfaceDetailsModal from './InterfaceDetailsModal';
import RefreshButton from './RefreshButton';
import PortDetailsModal from './PortDetailsModal';
import { getPublishingReturnFocus, clearPublishingReturnFocus } from '@/lib/publishingNavigation';
import { useAutoRefresh } from '@/hooks/useAutoRefresh';
import OverviewMetricHistoryModal, { MetricKey } from './OverviewMetricHistoryModal';
import { 
  Network, 
  Activity, 
  Wifi, 
  Battery, 
  EthernetPort,
  TrendingUp,
  TrendingDown,
  Minus,
  Users,
  UserCheck,
  Radio,
  Signal,
  MessageSquare,
  Search,
  XCircle,
  PlugZap,
} from 'lucide-react';

type MetricTrend = 'up' | 'down' | 'stable';

interface OverviewMetricsState {
  totalNodes: number;
  activeNodes: number;
  reachableNodes: number;
  activeConnections: number;
  channels: number;
  avgBattery: number | null;
  avgRSSI: number | null;
  avgSNR: number | null;
}

const METRIC_KEYS: MetricKey[] = [
  'totalNodes',
  'activeNodes',
  'reachableNodes',
  'activeConnections',
  'channels',
  'avgBattery',
  'avgRSSI',
  'avgSNR',
];
const TREND_EPSILON = 0.1;

const DEFAULT_OVERVIEW_METRICS: OverviewMetricsState = {
  totalNodes: 0,
  activeNodes: 0,
  reachableNodes: 0,
  activeConnections: 0,
  channels: 0,
  avgBattery: null,
  avgRSSI: null,
  avgSNR: null,
};

const DEFAULT_METRIC_TRENDS: Record<MetricKey, MetricTrend> = {
  totalNodes: 'stable',
  activeNodes: 'stable',
  reachableNodes: 'stable',
  activeConnections: 'stable',
  channels: 'stable',
  avgBattery: 'stable',
  avgRSSI: 'stable',
  avgSNR: 'stable',
};

const deriveTrend = (previous: number | null, next: number | null): MetricTrend => {
  if (previous === null || next === null) {
    return 'stable';
  }

  if (Math.abs(next - previous) <= TREND_EPSILON) {
    return 'stable';
  }

  return next > previous ? 'up' : 'down';
};

const computeTrends = (
  previous: OverviewMetricsState | null,
  next: OverviewMetricsState,
): Record<MetricKey, MetricTrend> => {
  return METRIC_KEYS.reduce((acc, key) => {
    const prevValue = previous ? previous[key] : null;
    const nextValue = next[key];
    acc[key] = deriveTrend(prevValue, nextValue);
    return acc;
  }, {} as Record<MetricKey, MetricTrend>);
};

interface StatsCardProps {
  title: string;
  value: string | number;
  icon: React.ComponentType<any>;
  description?: string;
  trend?: MetricTrend;
  onClick?: () => void;
}

function StatsCard({ title, value, icon: Icon, description, trend, onClick }: StatsCardProps) {
  let trendContent: React.ReactNode = null;

  if (trend) {
    const TrendIconComponent = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus;
    const iconColor = trend === 'up' ? 'text-green-500' : trend === 'down' ? 'text-red-500' : 'text-gray-400';
    const textColor = trend === 'up' ? 'text-green-600' : trend === 'down' ? 'text-red-600' : 'text-gray-500';
    const trendLabel = trend === 'up' ? 'Increasing' : trend === 'down' ? 'Decreasing' : 'Stable';

    trendContent = (
      <div className="mt-4 flex items-center">
        <TrendIconComponent className={`h-4 w-4 mr-1 ${iconColor}`} />
        <span className={`text-sm ${textColor}`}>
          {trendLabel}
        </span>
      </div>
    );
  }

  const isInteractive = typeof onClick === 'function';

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!onClick) {
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onClick();
    }
  };

  return (
    <div
      className={`bg-white rounded-lg border border-gray-200 shadow-sm p-4 sm:p-6 ${
        isInteractive ? 'cursor-pointer transition-transform hover:-translate-y-0.5 hover:shadow-md focus-within:ring-2 focus-within:ring-blue-500 focus-within:ring-offset-2 focus:outline-none' : ''
      }`}
      onClick={onClick}
      onKeyDown={isInteractive ? handleKeyDown : undefined}
  role={isInteractive ? 'button' : undefined}
  tabIndex={isInteractive ? 0 : undefined}
    >
      <div className="flex items-center justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-xs sm:text-sm font-medium text-gray-600 truncate">{title}</p>
          <p className="text-lg sm:text-2xl font-bold text-gray-900 mt-1">{value}</p>
          {description && (
            <p className="text-xs sm:text-sm text-gray-500 mt-1 truncate">{description}</p>
          )}
        </div>
        <div className="h-10 w-10 sm:h-12 sm:w-12 bg-blue-50 rounded-lg flex items-center justify-center flex-shrink-0 ml-3">
          <Icon className="h-5 w-5 sm:h-6 sm:w-6 text-blue-600" />
        </div>
      </div>
      {trendContent}
    </div>
  );
}

function formatRelativeTime(timestamp?: string | null): string {
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
}

interface RecentNodeProps {
  node: Node;
  onClick: (node: Node) => void;
}

function RecentNode({ node, onClick }: RecentNodeProps) {
  const timeSinceLastSeen = Math.floor((Date.now() - new Date(node.last_seen).getTime()) / 1000 / 60);
  
  // Get the exact same color as used in the network graph
  const activityColor = getNodeActivityColor(node.last_seen);
  const latencyStatus = (() => {
    if (node.latency_reachable === true) {
      return { label: 'Reachable', className: 'text-green-600' };
    }
    if (node.latency_reachable === false) {
      return { label: 'Unreachable', className: 'text-red-600' };
    }
    return { label: 'No recent probe', className: 'text-gray-500' };
  })();

  const latencyLabel = node.latency_ms !== null && node.latency_ms !== undefined
    ? `Latency: ${node.latency_ms} ms`
    : 'Latency: N/A';
  
  return (
    <div 
      className="flex items-center justify-between p-3 border-b border-gray-100 last:border-b-0 hover:bg-gray-50 cursor-pointer transition-colors"
      onClick={() => onClick(node)}
    >
      <div className="flex items-center">
        <div 
          className="h-3 w-3 rounded-full mr-3"
          style={{ backgroundColor: activityColor }}
        />
        <div>
          <p className="text-sm font-medium text-gray-900">
            {node.short_name && node.long_name 
              ? `${node.short_name} - ${node.long_name}`
              : node.short_name || node.long_name || `${node.node_num}`}
          </p>
          <p className="text-xs text-gray-500">{node.node_id}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className={`text-xs font-medium ${latencyStatus.className}`}>
              {latencyStatus.label}
            </span>
            <span className="text-xs text-gray-500">
              {latencyLabel}
            </span>
          </div>
        </div>
      </div>
      <div className="text-right">
        <p className="text-xs text-gray-500">
          {timeSinceLastSeen < 1 ? 'Just now' : 
           timeSinceLastSeen < 60 ? `${timeSinceLastSeen}m ago` : 
           `${Math.floor(timeSinceLastSeen / 60)}h ago`}
        </p>
        {node.battery_level && (
          <p className="text-xs text-gray-400">{node.battery_level}%</p>
        )}
      </div>
    </div>
  );
}

interface RecentChannelProps {
  channel: Channel;
  onClick: (channel: Channel) => void;
}

function RecentChannel({ channel, onClick }: RecentChannelProps) {
  const timeSinceLastSeen = Math.floor((Date.now() - new Date(channel.last_seen).getTime()) / 1000 / 60);
  
  // Get the same activity color logic as nodes
  const activityColor = getNodeActivityColor(channel.last_seen);
  
  return (
    <div 
      className="flex items-center justify-between p-3 border-b border-gray-100 last:border-b-0 hover:bg-gray-50 cursor-pointer transition-colors"
      onClick={() => onClick(channel)}
    >
      <div className="flex items-center">
        <div 
          className="h-3 w-3 rounded-full mr-3"
          style={{ backgroundColor: activityColor }}
        />
        <div>
          <p className="text-sm font-medium text-gray-900">{channel.channel_id}</p>
          <p className="text-xs text-gray-500">
            {channel.members_count} members • {channel.total_messages} messages
          </p>
        </div>
      </div>
      <div className="text-right">
        <p className="text-xs text-gray-500">
          {timeSinceLastSeen < 1 ? 'Just now' : 
           timeSinceLastSeen < 60 ? `${timeSinceLastSeen}m ago` : 
           `${Math.floor(timeSinceLastSeen / 60)}h ago`}
        </p>
      </div>
    </div>
  );
}

function Overview() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [nodes, setNodes] = useState<Node[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [interfaces, setInterfaces] = useState<Interface[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [overviewMetrics, setOverviewMetrics] = useState<OverviewMetricsState>(DEFAULT_OVERVIEW_METRICS);
  const [metricTrends, setMetricTrends] = useState<Record<MetricKey, MetricTrend>>(DEFAULT_METRIC_TRENDS);
  const [metricsHistory, setMetricsHistory] = useState<OverviewMetricSnapshot[]>([]);
  const [selectedMetric, setSelectedMetric] = useState<MetricKey | null>(null);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
  const [isChannelModalOpen, setIsChannelModalOpen] = useState(false);
  const [selectedInterface, setSelectedInterface] = useState<Interface | null>(null);
  const [isInterfaceModalOpen, setIsInterfaceModalOpen] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [nodeSearch, setNodeSearch] = useState('');
  const [portActivity, setPortActivity] = useState<PortActivityEntry[]>([]);
  const [selectedPortEntry, setSelectedPortEntry] = useState<PortActivityEntry | null>(null);
  const [isPortModalOpen, setIsPortModalOpen] = useState(false);
  const metricsRef = useRef<OverviewMetricsState | null>(null);
  const isFetchingRef = useRef(false);
  const searchParamsString = searchParams?.toString() ?? '';
  const focusNodeParam = searchParams?.get('focusNode');
  const [pendingFocus, setPendingFocus] = useState<{ nodeId: string; source: 'query' | 'storage' } | null>(null);

  useEffect(() => {
    if (focusNodeParam) {
      setPendingFocus({ nodeId: focusNodeParam, source: 'query' });
      return;
    }

    const stored = getPublishingReturnFocus();
    if (stored && stored.originTab === 'overview') {
      setPendingFocus({ nodeId: stored.nodeId, source: 'storage' });
    }
  }, [focusNodeParam]);

  useEffect(() => {
    if (!pendingFocus) {
      return;
    }

    let isActive = true;

    (async () => {
      let targetNode = nodes.find((node) => node.node_id === pendingFocus.nodeId);
      if (!targetNode) {
        try {
          const response = await apiClient.getNode(pendingFocus.nodeId);
          targetNode = response.data;
        } catch (error) {
          console.warn('Failed to load focus node', error);
        }
      }

      if (!isActive) {
        return;
      }

      if (targetNode) {
        setSelectedNode(targetNode);
        setIsModalOpen(true);
      }

      if (pendingFocus.source === 'query') {
        const params = new URLSearchParams(searchParamsString);
        if (params.has('focusNode')) {
          params.delete('focusNode');
          router.replace(params.toString() ? `?${params}` : '?', { scroll: false });
        }
      }

      clearPublishingReturnFocus();
      setPendingFocus(null);
    })();

    return () => {
      isActive = false;
    };
  }, [pendingFocus, nodes, router, searchParamsString]);

  const handleNodeClick = (node: Node) => {
    setSelectedNode(node);
    setIsModalOpen(true);
  };

  const handleInterfaceClick = (iface: Interface) => {
    setSelectedInterface(iface);
    setIsInterfaceModalOpen(true);
  };

  // Refresh interfaces after start/stop
  const handleInterfaceStatusChange = async () => {
    await fetchData('refresh');
  };

  const handleMetricCardClick = useCallback((key: MetricKey) => {
    setSelectedMetric(key);
  }, []);

  const handleCloseMetricModal = useCallback(() => {
    setSelectedMetric(null);
  }, []);

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedNode(null);
  };

  const handleCloseInterfaceModal = () => {
    setIsInterfaceModalOpen(false);
    setSelectedInterface(null);
  };

  const handleChannelClick = (channel: Channel) => {
    setSelectedChannel(channel);
    setIsChannelModalOpen(true);
  };

  const handleCloseChannelModal = () => {
    setIsChannelModalOpen(false);
    setSelectedChannel(null);
  };

  const handlePortEntryClick = (entry: PortActivityEntry) => {
    if (selectedPortEntry?.port === entry.port && isPortModalOpen) {
      handleClosePortModal();
      return;
    }
    setSelectedPortEntry(entry);
    setIsPortModalOpen(true);
  };

  const handleClosePortModal = () => {
    setIsPortModalOpen(false);
    setSelectedPortEntry(null);
  };

  const fetchData = useCallback(async (mode: 'initial' | 'refresh' = 'refresh') => {
    if (isFetchingRef.current) {
      return;
    }

    isFetchingRef.current = true;

    const isInitial = mode === 'initial';
    if (isInitial) {
      setIsLoading(true);
    } else {
      setIsRefreshing(true);
    }
    setError(null);
    try {
      const [
        metricsResponse,
        nodesResponse,
        channelsResponse,
        interfacesResponse,
        portsResponse,
      ] = await Promise.all([
        apiClient.getOverviewMetrics({ history_limit: 250 }),
        apiClient.getNodes(),
        apiClient.getChannelStatistics(),
        apiClient.getInterfaces(),
        apiClient.getPortActivity(),
      ]);

      const currentMetrics = metricsResponse.data.current;
      const nextMetrics: OverviewMetricsState = {
        totalNodes: currentMetrics.total_nodes,
        activeNodes: currentMetrics.active_nodes,
        reachableNodes: currentMetrics.reachable_nodes,
        activeConnections: currentMetrics.active_connections,
        channels: currentMetrics.channels,
        avgBattery: currentMetrics.avg_battery ?? null,
        avgRSSI: currentMetrics.avg_rssi ?? null,
        avgSNR: currentMetrics.avg_snr ?? null,
      };

      const nextTrends = computeTrends(metricsRef.current, nextMetrics);
      setMetricTrends(nextTrends);
      setOverviewMetrics(nextMetrics);
      metricsRef.current = nextMetrics;
      setMetricsHistory(metricsResponse.data.history);

      setNodes(nodesResponse.data);
      setChannels(channelsResponse.data.channels);
      setInterfaces(interfacesResponse.data);
      setPortActivity(portsResponse.data);
      setSelectedPortEntry((current) => {
        if (!current) {
          return current;
        }
        const updated = portsResponse.data.find((entry) => entry.port === current.port);
        return updated || current;
      });
      setLastUpdated(new Date());
    } catch (err) {
      console.error('Failed to fetch overview data:', err);
      setError('Failed to load overview data');
    } finally {
      if (isInitial) {
        setIsLoading(false);
      } else {
        setIsRefreshing(false);
      }
      isFetchingRef.current = false;
    }
  }, []);

  const handleRefresh = useCallback(() => fetchData('refresh'), [fetchData]);

  useEffect(() => {
    fetchData('initial');
  }, [fetchData]);

  useAutoRefresh(handleRefresh, { intervalMs: 60_000 });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
          <p className="text-gray-600">Loading overview...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-700">{error}</p>
      </div>
    );
  }
  const recentNodes = [...nodes]
    .sort((a, b) => new Date(b.last_seen).getTime() - new Date(a.last_seen).getTime());

  const normalizedSearch = nodeSearch.trim().toLowerCase();
  const filteredRecentNodes = normalizedSearch
    ? recentNodes.filter((node) => {
        const fields: Array<string | number | undefined | null> = [
          node.short_name,
          node.long_name,
          node.node_id,
          node.mac_address,
          node.hw_model,
          node.role,
          node.node_num,
        ];
        return fields.some((field) => {
          if (field === undefined || field === null) {
            return false;
          }
          if (typeof field === 'number') {
            const decimalMatch = field.toString().toLowerCase().includes(normalizedSearch);
            const hexMatch = field.toString(16).toLowerCase().includes(normalizedSearch.replace(/^0x/, ''));
            return decimalMatch || hexMatch;
          }
          return field.toString().toLowerCase().includes(normalizedSearch);
        });
      })
    : recentNodes;

  // Deduplicate channels by channel_name and channel_num
  const seenChannelKeys = new Set<string>();
  const dedupedChannels: Channel[] = [];
  for (const channel of channels) {
    const key = `${channel.channel_id ?? ''}|${channel.channel_num ?? ''}`;
    if (!seenChannelKeys.has(key)) {
      seenChannelKeys.add(key);
      dedupedChannels.push(channel);
    }
  }
  const recentChannels = [...dedupedChannels]
    .sort((a, b) => new Date(b.last_seen).getTime() - new Date(a.last_seen).getTime());

  const totalMessages = channels.reduce((sum, channel) => sum + channel.total_messages, 0);

  const batteryDisplay = overviewMetrics.avgBattery !== null
    ? `${Math.round(overviewMetrics.avgBattery)}%`
    : 'N/A';
  const rssiDisplay = overviewMetrics.avgRSSI !== null
    ? `${overviewMetrics.avgRSSI.toFixed(1)} dBm`
    : 'N/A';
  const snrDisplay = overviewMetrics.avgSNR !== null
    ? `${Math.round(overviewMetrics.avgSNR * 10) / 10} dB`
    : 'N/A';

  const averageRSSI = overviewMetrics.avgRSSI;
  const connectionQualityLabel = averageRSSI === null
    ? 'Unknown'
    : averageRSSI > -50
      ? 'Excellent'
      : averageRSSI > -70
        ? 'Good'
        : 'Poor';
  const connectionQualityClass = averageRSSI === null
    ? 'text-gray-600'
    : averageRSSI > -50
      ? 'text-green-600'
      : averageRSSI > -70
        ? 'text-yellow-600'
        : 'text-red-600';

  return (
    <div className="space-y-6">
      {/* Header with refresh button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Network Overview</h2>
          <p className="text-sm sm:text-base text-gray-600">Monitor your Meshtastic network at a glance</p>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center sm:space-x-3 space-y-2 sm:space-y-0">
          <RefreshButton
            onRefresh={handleRefresh}
            isRefreshing={isRefreshing}
            disabled={isLoading}
          />
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4 gap-3 sm:gap-6">
        <StatsCard
          title="Total Nodes"
          value={overviewMetrics.totalNodes.toLocaleString()}
          icon={Users}
          description={`${overviewMetrics.activeNodes.toLocaleString()} active • ${overviewMetrics.reachableNodes.toLocaleString()} reachable`}
          trend={metricTrends.totalNodes}
          onClick={() => handleMetricCardClick('totalNodes')}
        />
        <StatsCard
          title="Active Nodes"
          value={overviewMetrics.activeNodes.toLocaleString()}
          icon={Activity}
          description="Seen within the active window"
          trend={metricTrends.activeNodes}
          onClick={() => handleMetricCardClick('activeNodes')}
        />
        <StatsCard
          title="Reachable Nodes"
          value={overviewMetrics.reachableNodes.toLocaleString()}
          icon={UserCheck}
          description="Active and responsive to probes"
          trend={metricTrends.reachableNodes}
          onClick={() => handleMetricCardClick('reachableNodes')}
        />
        <StatsCard
          title="Active Connections"
          value={overviewMetrics.activeConnections.toLocaleString()}
          icon={Network}
          description="Network links"
          trend={metricTrends.activeConnections}
          onClick={() => handleMetricCardClick('activeConnections')}
        />
        <StatsCard
          title="Channels"
          value={overviewMetrics.channels.toLocaleString()}
          icon={MessageSquare}
          description={`${totalMessages.toLocaleString()} messages`}
          trend={metricTrends.channels}
          onClick={() => handleMetricCardClick('channels')}
        />
        <StatsCard
          title="Avg Battery"
          value={batteryDisplay}
          icon={Battery}
          description="Network health"
          trend={metricTrends.avgBattery}
          onClick={() => handleMetricCardClick('avgBattery')}
        />
        <StatsCard
          title="Avg RSSI"
          value={rssiDisplay}
          icon={Radio}
          description="Signal strength"
          trend={metricTrends.avgRSSI}
          onClick={() => handleMetricCardClick('avgRSSI')}
        />
        <StatsCard
          title="Avg SNR"
          value={snrDisplay}
          icon={Signal}
          description="Signal quality"
          trend={metricTrends.avgSNR}
          onClick={() => handleMetricCardClick('avgSNR')}
        />
      </div>

      {/* Recent Activity & Interfaces */}
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
        {/* Recent Nodes */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
          <div className="p-6 border-b border-gray-200 space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center">
                <Activity className="h-5 w-5 text-gray-400 mr-2" />
                <h3 className="text-lg font-semibold text-gray-900">Recent Node Activity</h3>
              </div>
              <span className="text-xs text-gray-500">
                Showing {filteredRecentNodes.length} of {recentNodes.length}
              </span>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" aria-hidden="true" />
              <input
                type="text"
                value={nodeSearch}
                onChange={(event) => setNodeSearch(event.target.value)}
                placeholder="Search nodes by name, ID, or MAC"
                className="w-full rounded-md border border-gray-300 pl-9 pr-10 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                aria-label="Filter recent nodes"
              />
              {nodeSearch && (
                <button
                  type="button"
                  onClick={() => setNodeSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  aria-label="Clear node search"
                >
                  <XCircle className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
          <div className="max-h-96 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100">
            {filteredRecentNodes.length > 0 ? (
              filteredRecentNodes.map((node) => (
                <RecentNode key={node.node_id} node={node} onClick={handleNodeClick} />
              ))
            ) : recentNodes.length > 0 ? (
              <div className="p-6 text-center text-gray-500">
                No nodes match &quot;{nodeSearch}&quot;
              </div>
            ) : (
              <div className="p-6 text-center text-gray-500">
                No recent activity
              </div>
            )}
          </div>
        </div>

        {/* Recent Channels */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
          <div className="p-6 border-b border-gray-200">
            <div className="flex items-center">
              <MessageSquare className="h-5 w-5 text-gray-400 mr-2" />
              <h3 className="text-lg font-semibold text-gray-900">Channel Activity</h3>
            </div>
          </div>
          <div className="max-h-96 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100">
            {recentChannels.length > 0 ? (
              recentChannels.map((channel) => (
                <RecentChannel key={channel.channel_id} channel={channel} onClick={handleChannelClick} />
              ))
            ) : (
              <div className="p-6 text-center text-gray-500">
                No channel activity
              </div>
            )}
          </div>
        </div>
        {/* Network Health */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
          <div className="p-6 border-b border-gray-200">
            <div className="flex items-center">
              <Wifi className="h-5 w-5 text-gray-400 mr-2" />
              <h3 className="text-lg font-semibold text-gray-900">Network Health</h3>
            </div>
          </div>
          <div className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Active Nodes</span>
              <span className="text-sm font-medium text-gray-900">
                {overviewMetrics.activeNodes.toLocaleString()}/{nodes.length.toLocaleString()}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Network Coverage</span>
              <span className="text-sm font-medium text-green-600">
                {nodes.length > 0 ? Math.round((overviewMetrics.activeNodes / nodes.length) * 100) : 0}%
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Connection Quality</span>
              <span className={`text-sm font-medium ${connectionQualityClass}`}>
                {connectionQualityLabel}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Last Update</span>
              <span className="text-sm text-gray-500">
                {lastUpdated ? lastUpdated.toLocaleTimeString() : '—'}
              </span>
            </div>
          </div>
        </div>

      {/* Interfaces Overview */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center">
            <EthernetPort className="h-5 w-5 text-gray-400 mr-2" />
            <h3 className="text-lg font-semibold text-gray-900">Interfaces</h3>
          </div>
        </div>
        <div className="p-6 space-y-2">
          {interfaces.length > 0 ? (
            interfaces.map((iface, idx) => {
              const isRunning = iface.status === 'RUNNING';
              const isEnabled = iface.is_enabled !== undefined ? iface.is_enabled : true;
              let statusColor = 'text-gray-500 bg-gray-100';
              if (iface.status === 'RUNNING') statusColor = 'text-green-700 bg-green-100';
              else if (iface.status === 'CONNECTING') statusColor = 'text-yellow-700 bg-yellow-100';
              else if (iface.status === 'ERROR') statusColor = 'text-red-700 bg-red-100';
              return (
                <div key={iface.id || idx} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-b-0 hover:bg-gray-50 cursor-pointer"
                  onClick={() => handleInterfaceClick(iface)}>
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className={`h-3 w-3 rounded-full inline-block ${isRunning ? 'bg-green-500' : 'bg-gray-300'}`}
                      title={isRunning ? 'Running' : 'Stopped'}
                    />
                    <span className="text-sm font-medium text-gray-900 truncate" title={iface.display_name}>{iface.display_name || 'Unnamed'}</span>
                    <span className="text-xs text-gray-500 px-2 py-1 bg-gray-100 rounded">{iface.name || 'Unknown'}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className={`text-xs font-semibold px-2 py-1 rounded ${isEnabled ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}
                      title={isEnabled ? 'Enabled' : 'Disabled'}>
                      {isEnabled ? 'Enabled' : 'Disabled'}
                    </span>
                    <span className={`text-xs font-semibold px-2 py-1 rounded ${statusColor}`} title={iface.status}>
                      {iface.status || 'Unknown'}
                    </span>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="text-center text-gray-500">No interfaces found</div>
          )}
        </div>
      </div>
      {/* Port Activity */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center">
              <PlugZap className="h-5 w-5 text-gray-400 mr-2" />
              <h3 className="text-lg font-semibold text-gray-900">Port Activity</h3>
            </div>
            <span className="text-xs text-gray-500">{portActivity.length} ports</span>
          </div>
        </div>
        <div className="p-6">
          {portActivity.length > 0 ? (
            <div className="max-h-80 overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100">
              {portActivity.map((entry) => {
                const isSelected = isPortModalOpen && selectedPortEntry?.port === entry.port;
                return (
                  <div
                    key={entry.port}
                    role="button"
                    tabIndex={0}
                    aria-pressed={isSelected}
                    aria-label={`View nodes using port ${entry.display_name}`}
                    onClick={() => handlePortEntryClick(entry)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        handlePortEntryClick(entry);
                      }
                    }}
                    className={`flex items-center justify-between p-3 border-b border-gray-100 last:border-b-0 transition-colors ${
                      isSelected ? 'bg-blue-50 border-blue-200 cursor-pointer' : 'hover:bg-gray-50 cursor-pointer'
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{entry.display_name}</p>
                      <p className="text-xs text-gray-500 truncate">{entry.port}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-gray-900">{entry.total_packets}</p>
                      <p className="text-xs text-gray-500">{formatRelativeTime(entry.last_seen)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center text-gray-500">No port activity recorded</div>
          )}
        </div>
      </div>
      </div>

      <OverviewMetricHistoryModal
        metricKey={selectedMetric}
        isOpen={selectedMetric !== null}
        onClose={handleCloseMetricModal}
        history={metricsHistory}
        currentMetrics={overviewMetrics}
      />

      {/* Port Details Modal */}
      {selectedPortEntry && (
        <PortDetailsModal
          port={selectedPortEntry}
          isOpen={isPortModalOpen}
          onClose={handleClosePortModal}
        />
      )}

      {/* Node Details Modal */}
      {selectedNode && (
        <NodeDetailsModal
          node={selectedNode}
          isOpen={isModalOpen}
          onClose={handleCloseModal}
          interfaces={selectedNode.interfaces
            ? interfaces.filter((iface) =>
                selectedNode.interfaces?.includes?.(iface.display_name ?? '')
              )
            : interfaces}
          onInterfaceClick={handleInterfaceClick}
        />
      )}

      {/* Channel Details Modal */}
      {selectedChannel && (
        <ChannelDetailsModal
          channel={selectedChannel}
          isOpen={isChannelModalOpen}
          onClose={handleCloseChannelModal}
          interfaces={interfaces.filter(iface => selectedChannel.interface_ids?.includes?.(iface.id))}
          onInterfaceClick={handleInterfaceClick}
          members={selectedChannel.members || []}
        />
      )}

      {/* Interface Details Modal */}
      {selectedInterface && (
        <InterfaceDetailsModal
          iface={selectedInterface}
          isOpen={isInterfaceModalOpen}
          onClose={handleCloseInterfaceModal}
          onStatusChange={handleInterfaceStatusChange}
        />
      )}
    </div>
  );
}

export default Overview;