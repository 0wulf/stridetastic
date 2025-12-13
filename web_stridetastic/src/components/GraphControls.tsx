import React, { useState } from 'react';
import { ZoomIn, ZoomOut, Maximize2, Settings, ChevronDown, ChevronUp } from 'lucide-react';
import { ActivityTimeRange, getActivityTimeRanges } from '@/lib/activityFilters';
import RefreshButton from './RefreshButton';

import type { Interface } from '@/types/interface';
interface GraphControlsProps {
  maxHops: number;
  onMaxHopsChange: (value: number) => void;
  showBidirectionalOnly: boolean;
  onShowBidirectionalOnlyChange: (value: boolean) => void;
  showMqttInterface: boolean;
  onShowMqttInterfaceChange: (value: boolean) => void;
  forceBidirectional: boolean;
  onForceBidirectionalChange: (value: boolean) => void;
  excludeMultiHop: boolean;
  onExcludeMultiHopChange: (value: boolean) => void;
  activityFilter: ActivityTimeRange;
  onActivityFilterChange: (value: ActivityTimeRange) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomToFit: () => void;
  onRefresh: () => void;
  isLoading: boolean;
  isRefreshing: boolean;
  lastUpdate: Date | null;
  nodeCount: number;
  linkCount: number;
  interfaces: Interface[];
  selectedInterfaceIds: number[];
  onSelectedInterfaceIdsChange: (ids: number[]) => void;
  showAdvanced: boolean;
  setShowAdvanced: (show: boolean) => void;
  closeDropdownSignal?: number;
}

export function GraphControls({
  maxHops,
  onMaxHopsChange,
  showBidirectionalOnly,
  onShowBidirectionalOnlyChange,
  showMqttInterface,
  onShowMqttInterfaceChange,
  forceBidirectional,
  onForceBidirectionalChange,
  excludeMultiHop,
  onExcludeMultiHopChange,
  activityFilter,
  onActivityFilterChange,
  onZoomIn,
  onZoomOut,
  onZoomToFit,
  onRefresh,
  isLoading,
  isRefreshing,
  lastUpdate,
  nodeCount,
  linkCount,
  interfaces,
  selectedInterfaceIds,
  onSelectedInterfaceIdsChange,
  showAdvanced,
  setShowAdvanced,
  closeDropdownSignal,
}: GraphControlsProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // Close dropdown when parent signals
  React.useEffect(() => {
    if (closeDropdownSignal !== undefined) {
      setDropdownOpen(false);
    }
  }, [closeDropdownSignal]);

  // Close dropdown on outside click
  React.useEffect(() => {
    if (!dropdownOpen) return;
    function handleClick(e: MouseEvent) {
      if (!(e.target instanceof Node)) return;
      const dropdown = document.getElementById('interface-dropdown');
      if (dropdown && !dropdown.contains(e.target)) setDropdownOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [dropdownOpen]);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const activityTimeRanges = getActivityTimeRanges();

  return (
    <div className="mb-4 space-y-4">
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h2 className="text-xl sm:text-2xl font-bold truncate" style={{ color: '#111827' }}>
            Network Topology
          </h2>
          {lastUpdate && (
            <p className="text-xs sm:text-sm" style={{ color: '#6b7280' }}>
              <span className="hidden sm:inline">Last updated: {formatDate(lastUpdate.toISOString())} • </span>
              {nodeCount} nodes • {linkCount} links
            </p>
          )}
        </div>
        
        {/* Essential controls always visible */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Max Hops - always visible */}
          <div className="flex items-center space-x-1 sm:space-x-2 px-2 sm:px-3 py-1 bg-white border border-gray-300 rounded-lg">
            <label className="text-xs font-medium text-gray-700 whitespace-nowrap">Max Hops:</label>
            <input
              type="number"
              min="0"
              max="7"
              value={maxHops}
              onChange={(e) => onMaxHopsChange(Math.max(0, Math.min(7, parseInt(e.target.value) || 0)))}
              className="w-8 sm:w-12 px-1 py-0.5 text-xs border border-gray-200 rounded text-center"
              style={{ fontSize: '16px' }}
            />
          </div>

          {/* Advanced settings toggle */}
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center space-x-1 px-2 sm:px-3 py-1 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors touch-manipulation"
            style={{ minHeight: '36px' }}
          >
            <Settings className="h-4 w-4" />
            <span className="text-xs font-medium text-gray-700 hidden sm:inline">Settings</span>
            {showAdvanced ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
          
          {/* Zoom controls */}
          <button
            onClick={onZoomIn}
            className="p-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors touch-manipulation"
            title="Zoom In"
            style={{ minHeight: '36px', minWidth: '36px' }}
          >
            <ZoomIn className="h-4 w-4" />
          </button>
          <button
            onClick={onZoomOut}
            className="p-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors touch-manipulation"
            title="Zoom Out"
            style={{ minHeight: '36px', minWidth: '36px' }}
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          <button
            onClick={onZoomToFit}
            className="p-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors touch-manipulation"
            title="Zoom to Fit"
            style={{ minHeight: '36px', minWidth: '36px' }}
          >
            <Maximize2 className="h-4 w-4" />
          </button>
          <RefreshButton
            onRefresh={onRefresh}
            isRefreshing={isRefreshing || isLoading}
            disabled={isLoading}
            size="sm"
          />
        </div>
      </div>

      {/* Advanced Settings Panel */}
      {showAdvanced && (
        <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Advanced Settings</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Bidirectional Only */}
            <div className="flex items-center space-x-3 p-3 bg-white border border-gray-200 rounded-lg">
              <input
                type="checkbox"
                id="bidirectional"
                checked={showBidirectionalOnly}
                onChange={(e) => onShowBidirectionalOnlyChange(e.target.checked)}
                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <label htmlFor="bidirectional" className="text-sm font-medium text-gray-700 flex-1">
                Bidirectional Only
              </label>
            </div>

            {/* Show MQTT Client checkbox removed */}

            {/* Force Bidirectional */}
            <div className="flex items-center space-x-3 p-3 bg-white border border-gray-200 rounded-lg">
              <input
                type="checkbox"
                id="forceBidirectional"
                checked={forceBidirectional}
                onChange={(e) => onForceBidirectionalChange(e.target.checked)}
                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <label htmlFor="forceBidirectional" className="text-sm font-medium text-gray-700 flex-1">
                Assume Channel
              </label>
            </div>

            {/* Exclude Multi-Hop */}
            <div className="flex items-center space-x-3 p-3 bg-white border border-gray-200 rounded-lg">
              <input
                type="checkbox"
                id="excludeMultiHop"
                checked={excludeMultiHop}
                onChange={(e) => onExcludeMultiHopChange(e.target.checked)}
                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <label htmlFor="excludeMultiHop" className="text-sm font-medium text-gray-700 flex-1">
                Hide Multi-Hop
              </label>
            </div>

            {/* Activity Filter */}
            <div className="flex items-center space-x-3 p-3 bg-white border border-gray-200 rounded-lg">
              <label className="text-sm font-medium text-gray-700">Activity Filter:</label>
              <select
                value={activityFilter}
                onChange={(e) => onActivityFilterChange(e.target.value as ActivityTimeRange)}
                className="flex-1 text-sm border border-gray-300 rounded px-2 py-1 focus:ring-blue-500 focus:border-blue-500"
                style={{ fontSize: '16px' }}
              >
                {activityTimeRanges.map((range) => (
                  <option key={range.value} value={range.value}>
                    {range.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Interface Selection (dropdown, mobile-friendly) */}
            <div className="flex flex-col space-y-1 p-3 bg-white border border-gray-200 rounded-lg relative">
              <label className="text-sm font-medium text-gray-700">Show Interfaces:</label>
              <button
                type="button"
                className="flex justify-between items-center w-full border border-gray-300 rounded px-2 py-1 bg-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                onClick={() => setDropdownOpen((v) => !v)}
                aria-haspopup="listbox"
                aria-expanded={dropdownOpen}
              >
                <span className="truncate flex-1 text-left">
                  {selectedInterfaceIds.length === 0
                    ? 'No Interfaces Selected'
                    : interfaces
                        .filter((iface) => selectedInterfaceIds.includes(iface.id))
                        .map((iface) => iface.display_name || iface.name)
                        .join(', ')}
                </span>
                <ChevronDown className={`ml-2 h-4 w-4 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
              </button>
              {dropdownOpen && (
                <div
                  id="interface-dropdown"
                  className="absolute z-20 mt-1 w-full bg-white border border-gray-300 rounded shadow-lg max-h-60 overflow-auto"
                  style={{ minWidth: '200px' }}
                >
                  <div className="p-2">
                    <button
                      type="button"
                      className="w-full text-xs text-left px-2 py-1 rounded hover:bg-gray-100 mb-1"
                      onClick={() => onSelectedInterfaceIdsChange(interfaces.map((iface) => iface.id))}
                    >
                      Select All
                    </button>
                  </div>
                  <ul className="max-h-48 overflow-auto">
                    {interfaces.map((iface) => (
                      <li key={iface.id} className="px-2 py-1 hover:bg-gray-50 flex items-center">
                        <input
                          type="checkbox"
                          id={`iface-${iface.id}`}
                          checked={selectedInterfaceIds.includes(iface.id)}
                          onChange={() => {
                            if (selectedInterfaceIds.includes(iface.id)) {
                              onSelectedInterfaceIdsChange(selectedInterfaceIds.filter((id) => id !== iface.id));
                            } else {
                              onSelectedInterfaceIdsChange([...selectedInterfaceIds, iface.id]);
                            }
                          }}
                          className="mr-2 w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                        />
                        <label htmlFor={`iface-${iface.id}`} className="text-sm text-gray-700 truncate cursor-pointer">
                          {iface.display_name || iface.name}
                        </label>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
