'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, RefreshCcw, Search, Link2, ArrowRight } from 'lucide-react';
import { apiClient } from '@/lib/api';
import type { ActivityTimeRange } from '@/lib/activityFilters';
import { getActivityTimeRanges } from '@/lib/activityFilters';
import type { NodeLink, NodeLinkPacket, LinkNodeSummary, LinkChannelSummary } from '@/types';

const DEFAULT_LIMIT = 100;
const PACKET_LIMIT = 50;
const PORT_FILTER_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'TEXT_MESSAGE_APP', label: 'Text Message App' },
  { value: 'POSITION_APP', label: 'Position' },
  { value: 'NODEINFO_APP', label: 'Node Info' },
  { value: 'NEIGHBORINFO_APP', label: 'Neighbor Info' },
  { value: 'TELEMETRY_APP', label: 'Telemetry' },
  { value: 'TRACEROUTE_APP', label: 'Traceroute' },
  { value: 'ROUTING_APP', label: 'Routing' },
];

type BidirectionalFilter = 'all' | 'bidirectional' | 'unidirectional';

type MaybeNumber = number | null;

function formatRelativeTime(timestamp?: string | null): string {
  if (!timestamp) return '—';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '—';

  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.round(diffMs / 60000);
  if (diffMinutes < 1) {
    return 'just now';
  }
  if (diffMinutes < 60) {
    return `${diffMinutes} min${diffMinutes === 1 ? '' : 's'} ago`;
  }
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours} hr${diffHours === 1 ? '' : 's'} ago`;
  }
  const diffDays = Math.round(diffHours / 24);
  return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
}

function formatTimestamp(timestamp?: string | null): string {
  if (!timestamp) return '—';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }
  return date.toLocaleString();
}

function nodeDisplay(node: LinkNodeSummary): string {
  return node.short_name || node.long_name || node.node_id;
}

interface OrderedLinkView {
  leftNode: LinkNodeSummary;
  rightNode: LinkNodeSummary;
  leftToRightPackets: number;
  rightToLeftPackets: number;
  isFlipped: boolean;
}

interface ChannelTabInfo {
  key: string;
  label: string;
  count: number;
}

function orientLink(link: NodeLink): OrderedLinkView {
  const aToB = link.node_a_to_node_b_packets;
  const bToA = link.node_b_to_node_a_packets;

  if (aToB >= bToA) {
    return {
      leftNode: link.node_a,
      rightNode: link.node_b,
      leftToRightPackets: aToB,
      rightToLeftPackets: bToA,
      isFlipped: false,
    };
  }

  return {
    leftNode: link.node_b,
    rightNode: link.node_a,
    leftToRightPackets: bToA,
    rightToLeftPackets: aToB,
    isFlipped: true,
  };
}

function getChannelKey(channel?: LinkChannelSummary | null): string {
  if (!channel || !channel.channel_id) {
    return 'unknown';
  }
  const numPart = channel.channel_num != null && channel.channel_num !== undefined ? channel.channel_num : 'na';
  return `${channel.channel_id}::${numPart}`;
}

function formatChannelLabel(channel?: LinkChannelSummary | null): string {
  if (!channel || !channel.channel_id) {
    return 'Unknown channel';
  }
  return channel.channel_num != null && channel.channel_num !== undefined
    ? `${channel.channel_id} · #${channel.channel_num}`
    : channel.channel_id;
}

export default function LinksPanel() {
  const [links, setLinks] = useState<NodeLink[]>([]);
  const [loadingLinks, setLoadingLinks] = useState(false);
  const [linksError, setLinksError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [timeRange, setTimeRange] = useState<ActivityTimeRange>('1hour');
  const [directionFilter, setDirectionFilter] = useState<BidirectionalFilter>('all');
  const [portFilter, setPortFilter] = useState<string>('all');

  const [selectedLinkId, setSelectedLinkId] = useState<MaybeNumber>(null);
  const [selectedLink, setSelectedLink] = useState<NodeLink | null>(null);
  const [linkPackets, setLinkPackets] = useState<NodeLinkPacket[]>([]);
  const [packetsLoading, setPacketsLoading] = useState(false);
  const [packetsError, setPacketsError] = useState<string | null>(null);
  const [packetsStalled, setPacketsStalled] = useState(false);
  const [activeChannelKey, setActiveChannelKey] = useState<string>('all');

  const isMountedRef = useRef(true);
  const selectedLinkIdRef = useRef<MaybeNumber>(null);
  const chatContainerRef = useRef<HTMLDivElement | null>(null);

  const setSelectedLinkIdSync = useCallback(
    (linkId: MaybeNumber) => {
      selectedLinkIdRef.current = linkId;
      setSelectedLinkId(linkId);
    },
    []
  );

  useEffect(() => {
    selectedLinkIdRef.current = selectedLinkId;
  }, [selectedLinkId]);

  useEffect(() => {
    setActiveChannelKey('all');
  }, [selectedLink?.id]);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const handler = window.setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
    }, 300);
    return () => window.clearTimeout(handler);
  }, [searchInput]);

  const loadLinkDetails = useCallback(
    async (linkId: number) => {
      if (!isMountedRef.current) return;
      setPacketsLoading(true);
      setPacketsStalled(false);
      setPacketsError(null);
      // start a watchdog to avoid indefinite spinner (6s)
      const watchdog = window.setTimeout(() => {
        if (isMountedRef.current) {
          setPacketsStalled(true);
        }
      }, 6000);
      try {
        const params: Record<string, unknown> = { order: 'desc', limit: PACKET_LIMIT };
        if (timeRange !== 'all') {
          params.last = timeRange;
        }
        if (portFilter !== 'all') {
          params.port = portFilter;
        }
        const [linkResponse, packetsResponse] = await Promise.all([
          apiClient.getLink(linkId),
          apiClient.getLinkPackets(
            linkId,
            params as {
              order: 'asc' | 'desc';
              limit?: number;
              last?: ActivityTimeRange;
              port?: string;
            }
          ),
        ]);

  // debug: log link and packets responses
  // eslint-disable-next-line no-console
  console.log('[LinksPanel] getLink response', { linkId, linkData: linkResponse?.data });
  // eslint-disable-next-line no-console
  console.log('[LinksPanel] getLinkPackets response', { linkId, packetsCount: Array.isArray(packetsResponse?.data) ? packetsResponse.data.length : 'non-array' });

        if (!isMountedRef.current || selectedLinkIdRef.current !== linkId) return;
        setSelectedLink(linkResponse.data);
        setLinkPackets(packetsResponse.data || []);
      } catch (error) {
        if (!isMountedRef.current || selectedLinkIdRef.current !== linkId) return;
        console.error('[LinksPanel] Failed to load link details', error);
        setPacketsError('Unable to load link details. Please try again.');
        setLinkPackets([]);
      } finally {
        window.clearTimeout(watchdog);
        if (!isMountedRef.current || selectedLinkIdRef.current !== linkId) return;
        setPacketsLoading(false);
        setPacketsStalled(false);
        // debug
        // eslint-disable-next-line no-console
        console.log('[LinksPanel] packetsLoading set to false for', linkId);
      }
    },
    [timeRange, portFilter]
  );

  const loadLinks = useCallback(async () => {
    setLoadingLinks(true);
    setLinksError(null);
    try {
      const params: Record<string, unknown> = { limit: DEFAULT_LIMIT };
      if (debouncedSearch) {
        params.search = debouncedSearch;
      }
      if (directionFilter === 'bidirectional') {
        params.bidirectional = true;
      } else if (directionFilter === 'unidirectional') {
        params.bidirectional = false;
      }
      if (timeRange !== 'all') {
        params.last = timeRange;
      }
      if (portFilter !== 'all') {
        params.port = portFilter;
      }

      const response = await apiClient.getLinks(params as {
        search?: string;
        bidirectional?: boolean;
        last?: ActivityTimeRange;
        limit?: number;
        port?: string;
      });

      if (!isMountedRef.current) return;
  const fetched = response.data || [];
  // debug: log number of links fetched and params
  // eslint-disable-next-line no-console
  console.log('[LinksPanel] getLinks response count', Array.isArray(fetched) ? fetched.length : 'non-array', { params });
  setLinks(fetched);

      if (fetched.length === 0) {
        setSelectedLinkIdSync(null);
        setSelectedLink(null);
        setLinkPackets([]);
        return;
      }

      const previousSelectedId = selectedLinkIdRef.current;
      const matching = fetched.find((link) => link.id === previousSelectedId);
      const preferredLink = matching ?? fetched[0];

      setSelectedLink(preferredLink);

      if (previousSelectedId !== preferredLink.id) {
        setSelectedLinkIdSync(preferredLink.id);
      }

  // debug
  // eslint-disable-next-line no-console
  console.log('[LinksPanel] selected preferred link', { previousSelectedId, preferredLinkId: preferredLink.id });

      await loadLinkDetails(preferredLink.id);
    } catch (error) {
      if (!isMountedRef.current) return;
      console.error('[LinksPanel] Failed to load links', error);
      setLinksError('Unable to load link activity. Please try again.');
      setLinks([]);
      setSelectedLinkIdSync(null);
      setSelectedLink(null);
      setLinkPackets([]);
    } finally {
      if (!isMountedRef.current) return;
      setLoadingLinks(false);
    }
  }, [debouncedSearch, directionFilter, timeRange, portFilter, loadLinkDetails, setSelectedLinkIdSync]);

  useEffect(() => {
    loadLinks();
  }, [loadLinks]);

  const chatPackets = useMemo(() => {
    if (!linkPackets.length) {
      return [] as NodeLinkPacket[];
    }
    return [...linkPackets].sort((packetA, packetB) => {
      const timeA = packetA.timestamp ? new Date(packetA.timestamp).getTime() : 0;
      const timeB = packetB.timestamp ? new Date(packetB.timestamp).getTime() : 0;
      return timeA - timeB;
    });
  }, [linkPackets]);

  const selectedOrientation = useMemo(() => {
    return selectedLink ? orientLink(selectedLink) : null;
  }, [selectedLink]);

  const channelTabs = useMemo<ChannelTabInfo[]>(() => {
    if (!chatPackets.length) {
      return [];
    }
    const counts = new Map<string, ChannelTabInfo>();
    for (const packet of chatPackets) {
      const key = getChannelKey(packet.channel);
      const existing = counts.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        counts.set(key, {
          key,
          label: formatChannelLabel(packet.channel),
          count: 1,
        });
      }
    }
    return Array.from(counts.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [chatPackets]);

  useEffect(() => {
    if (activeChannelKey === 'all') {
      return;
    }
    const exists = channelTabs.some((tab) => tab.key === activeChannelKey);
    if (!exists) {
      setActiveChannelKey('all');
    }
  }, [activeChannelKey, channelTabs]);

  const filteredChatPackets = useMemo(() => {
    if (activeChannelKey === 'all') {
      return chatPackets;
    }
    return chatPackets.filter((packet) => getChannelKey(packet.channel) === activeChannelKey);
  }, [chatPackets, activeChannelKey]);

  const directionSummary = useMemo(() => {
    if (!selectedOrientation) return [] as Array<{ label: string; value: number }>;
    return [
      {
        label: `${nodeDisplay(selectedOrientation.leftNode)} → ${nodeDisplay(selectedOrientation.rightNode)}`,
        value: selectedOrientation.leftToRightPackets,
      },
      {
        label: `${nodeDisplay(selectedOrientation.rightNode)} → ${nodeDisplay(selectedOrientation.leftNode)}`,
        value: selectedOrientation.rightToLeftPackets,
      },
    ];
  }, [selectedOrientation]);

  useEffect(() => {
    if (packetsLoading) return;
    const container = chatContainerRef.current;
    if (!container) return;
    container.scrollTop = container.scrollHeight;
  }, [filteredChatPackets, packetsLoading, selectedLink?.id]);

  const handleRefresh = () => {
    loadLinks();
  };

  const handleRowClick = (linkId: number) => {
    const link = links.find((entry) => entry.id === linkId);
    if (link) {
      setSelectedLink(link);
    }
    setSelectedLinkIdSync(linkId);
    loadLinkDetails(linkId);
  };

  return (
    <div
      className="flex flex-col space-y-4"
      style={{ minHeight: '28rem', height: 'calc(100vh - 10rem)' }}
    >
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Logical Links</h1>
          <p className="text-sm text-gray-600">Aggregated packet activity between node pairs.</p>
        </div>
        <button
          type="button"
          onClick={handleRefresh}
          className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
          disabled={loadingLinks}
        >
          <RefreshCcw className={`h-4 w-4 ${loadingLinks ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <div className="grid flex-1 min-h-0 gap-4 lg:grid-cols-[minmax(0,1.05fr),minmax(0,1fr)] xl:grid-cols-2">
        <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-200 p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="search"
                  className="w-full rounded-md border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="Search by node name or ID"
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                />
              </div>
              <select
                className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                value={directionFilter}
                onChange={(event) => setDirectionFilter(event.target.value as BidirectionalFilter)}
              >
                <option value="all">All directions</option>
                <option value="bidirectional">Bidirectional only</option>
                <option value="unidirectional">One-way only</option>
              </select>
              <select
                className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                value={portFilter}
                onChange={(event) => setPortFilter(event.target.value)}
              >
                <option value="all">All ports</option>
                {PORT_FILTER_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <select
                className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                value={timeRange}
                onChange={(event) => setTimeRange(event.target.value as ActivityTimeRange)}
              >
                {getActivityTimeRanges().map((range) => (
                  <option key={range.value} value={range.value}>
                    {range.label}
                  </option>
                ))}
              </select>
            </div>
            {linksError && (
              <div className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                {linksError}
              </div>
            )}
          </div>

          <div className="flex-1 overflow-auto">
            {loadingLinks ? (
              <div className="flex h-full items-center justify-center p-8 text-gray-500">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Loading links…
              </div>
            ) : links.length === 0 ? (
              <div className="flex h-full items-center justify-center p-8 text-gray-500">
                No links found for the selected filters.
              </div>
            ) : (
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th scope="col" className="px-4 py-3 text-left font-medium">Nodes</th>
                    <th scope="col" className="px-4 py-3 text-left font-medium">Total packets</th>
                    <th scope="col" className="px-4 py-3 text-left font-medium">Direction</th>
                    <th scope="col" className="px-4 py-3 text-left font-medium">Last activity</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {links.map((link) => {
                    const isActive = link.id === selectedLinkId;
                    const orientation = orientLink(link);
                    return (
                      <tr
                        key={link.id}
                        className={`cursor-pointer transition-colors ${
                          isActive ? 'bg-blue-50 hover:bg-blue-100' : 'hover:bg-gray-50'
                        }`}
                        onClick={() => handleRowClick(link.id)}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2 text-sm font-medium text-gray-900">
                            <Link2 className="h-4 w-4 text-blue-500" />
                            <div className="flex items-center gap-1">
                              <span>{nodeDisplay(orientation.leftNode)}</span>
                              <ArrowRight className="h-4 w-4 text-gray-400" />
                              <span>{nodeDisplay(orientation.rightNode)}</span>
                            </div>
                          </div>
                          <div className="mt-1 text-xs text-gray-500">
                            {link.is_bidirectional ? 'Bidirectional' : 'One-way'} • First seen {formatRelativeTime(link.first_seen)}
                          </div>
                          {link.last_packet_port && (
                            <div className="mt-1 text-xs text-gray-500">
                              Last port: {link.last_packet_port_display || link.last_packet_port}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900">{link.total_packets.toLocaleString()}</td>
                        <td className="px-4 py-3 text-xs text-gray-600">
                          <div>{orientation.leftToRightPackets.toLocaleString()} → {orientation.rightToLeftPackets.toLocaleString()}</div>
                          <div className="mt-1 text-xs text-gray-500">Left→Right / Right→Left</div>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900">
                          <div>{formatRelativeTime(link.last_activity)}</div>
                          <div className="text-xs text-gray-500">{formatTimestamp(link.last_activity)}</div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

  <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-200 p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">Link details</h3>
              {selectedLink && (
                <span
                  className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
                    selectedLink.is_bidirectional ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'
                  }`}
                >
                  {selectedLink.is_bidirectional ? 'Bidirectional' : 'One-way'}
                </span>
              )}
            </div>
          </div>

          {!selectedLink ? (
            <div className="flex flex-1 items-center justify-center p-8 text-gray-500">
              Select a link to inspect recent traffic.
            </div>
          ) : !selectedOrientation ? (
            <div className="flex flex-1 items-center justify-center p-8 text-gray-500">
              Unable to determine orientation for this link.
            </div>
          ) : (
            <div className="flex-1 min-h-0 p-4">
              <div className="flex h-full flex-col gap-6 overflow-hidden">
                <div>
                  <div className="flex items-center gap-2 text-lg font-semibold text-gray-900">
                    <Link2 className="h-5 w-5 text-blue-500" />
                    <span>{nodeDisplay(selectedOrientation.leftNode)}</span>
                    <ArrowRight className="h-5 w-5 text-gray-400" />
                    <span>{nodeDisplay(selectedOrientation.rightNode)}</span>
                  </div>
                  <dl className="mt-3 grid grid-cols-1 gap-3 text-sm text-gray-700 sm:grid-cols-2">
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-gray-500">Last activity</dt>
                      <dd>{formatTimestamp(selectedLink.last_activity)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-gray-500">First seen</dt>
                      <dd>{formatTimestamp(selectedLink.first_seen)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-gray-500">Last packet port</dt>
                      <dd>{selectedLink.last_packet_port_display || selectedLink.last_packet_port || '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-gray-500">Channels observed</dt>
                      <dd>
                        {selectedLink.channels.length === 0 ? (
                          '—'
                        ) : (
                          <div className="flex flex-wrap gap-2 pt-1">
                            {selectedLink.channels.map((channel) => (
                              <span
                                key={`${channel.channel_id}-${channel.channel_num ?? 'na'}`}
                                className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700"
                              >
                                {channel.channel_id}
                                {channel.channel_num != null && channel.channel_num !== undefined ? ` · #${channel.channel_num}` : ''}
                              </span>
                            ))}
                          </div>
                        )}
                      </dd>
                    </div>
                  </dl>
                </div>

                <div>
                  <h4 className="text-sm font-semibold text-gray-900">Direction summary</h4>
                  <div className="mt-2 space-y-2">
                    {directionSummary.map((entry) => (
                      <div key={entry.label} className="flex items-center justify-between rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-700">
                        <span>{entry.label}</span>
                        <span className="font-semibold text-gray-900">{entry.value.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex min-h-0 flex-col">
                  <div className="mb-2 flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-gray-900">Recent packets</h4>
                    <span className="text-xs text-gray-500">
                      {packetsLoading
                        ? 'Loading…'
                        : `Showing ${filteredChatPackets.length} of ${chatPackets.length} packet${chatPackets.length === 1 ? '' : 's'}`}
                    </span>
                  </div>
                  {packetsError && (
                    <div className="mb-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{packetsError}</div>
                  )}
                  <div className="mb-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setActiveChannelKey('all')}
                      className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                        activeChannelKey === 'all'
                          ? 'bg-blue-600 text-white shadow'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      All ({chatPackets.length})
                    </button>
                    {channelTabs.map((tab) => (
                      <button
                        key={tab.key}
                        type="button"
                        onClick={() => setActiveChannelKey(tab.key)}
                        className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                          activeChannelKey === tab.key
                            ? 'bg-blue-600 text-white shadow'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        {tab.label} ({tab.count})
                      </button>
                    ))}
                  </div>
                  <div ref={chatContainerRef} className="flex-1 min-h-0 space-y-2 overflow-auto pr-1">
                    {packetsLoading ? (
                      <div className="flex items-center justify-center rounded-md border border-dashed border-gray-200 p-4 text-sm text-gray-500">
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Loading packet history…
                      </div>
                      ) : packetsStalled ? (
                        <div className="rounded-md border border-dashed border-yellow-300 bg-yellow-50 p-4 text-sm text-yellow-700">
                          Packet load taking longer than expected. Responses received? Check network / console.
                        </div>
                      ) : filteredChatPackets.length === 0 ? (
                      <div className="rounded-md border border-dashed border-gray-200 p-4 text-sm text-gray-500">
                        {chatPackets.length === 0
                          ? 'No packets observed in the selected time window.'
                          : 'No packets for this channel in the selected time window.'}
                      </div>
                    ) : (
                      filteredChatPackets.map((packet, index) => {
                        const key = packet.packet_id ?? `${packet.timestamp}-${index}`;
                        const isAToB = packet.direction === 'node_a_to_node_b';
                        const isLeftToRight = selectedOrientation.isFlipped ? !isAToB : isAToB;
                        const origin = isLeftToRight ? selectedOrientation.leftNode : selectedOrientation.rightNode;
                        const target = isLeftToRight ? selectedOrientation.rightNode : selectedOrientation.leftNode;
                        const portLabel = packet.port_display || packet.port || '—';
                        const channelLabel = formatChannelLabel(packet.channel);
                        const bubblePalette = isLeftToRight
                          ? 'bg-blue-50 border-blue-100 text-blue-900'
                          : 'bg-purple-50 border-purple-100 text-purple-900';
                        return (
                          <div key={key} className={`flex w-full flex-col ${isLeftToRight ? 'items-start' : 'items-end'}`}>
                            <div className="mb-1 flex items-center gap-2 text-xs text-gray-500">
                              <span className="font-semibold text-gray-700">{nodeDisplay(origin)}</span>
                              <ArrowRight className="h-3.5 w-3.5 text-gray-300" />
                              <span className="font-semibold text-gray-700">{nodeDisplay(target)}</span>
                              <span className="text-[11px] text-gray-400">{formatTimestamp(packet.timestamp)}</span>
                            </div>
                            <div className={`max-w-[85%] rounded-2xl border px-3 py-2 text-sm shadow-sm ${bubblePalette}`}>
                              <div className="text-xs uppercase tracking-wide text-gray-500">
                                Port: <span className="text-gray-900">{portLabel}</span>
                              </div>
                              <div className="mt-1 text-xs text-gray-500">
                                Channel: <span className="text-gray-900">{channelLabel}</span>
                              </div>
                              <div className="mt-2 text-xs text-gray-600">
                                Packet ID: <span className="text-gray-900">{packet.packet_id ?? '—'}</span>
                              </div>
                              {packet.payload && (
                                <div className="mt-2 text-xs text-gray-700">
                                  <div className="font-semibold text-gray-800">{packet.payload.payload_type}</div>
                                  <pre className="mt-1 max-h-36 overflow-auto rounded bg-white/60 p-2 text-[11px] leading-4 text-gray-700">
{JSON.stringify(packet.payload.fields, null, 2)}
                                  </pre>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
