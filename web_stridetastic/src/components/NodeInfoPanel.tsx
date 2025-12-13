import React from 'react';
import { Node } from '@/types';
import { formatDate, formatUptime, getBatteryColor } from '@/lib/utils';
import { formatLocationSourceLabel } from '@/lib/position';
import { 
  Wifi, 
  Battery, 
  Clock, 
  MapPin, 
  Thermometer, 
  Droplets, 
  Gauge, 
  Zap,
  Shield,
  Radio,
  Cpu,
  Wind,
  ExternalLink
} from 'lucide-react';
import { NodeActionButtons } from './NodeActionButtons';

interface NodeInfoPanelProps {
  node: Node;
  title: string;
  borderColor: string;
  onClose?: () => void;
  onNavigateToMap?: (nodeId: string) => void;
}

// Convert Meshtastic precision bits to radius in meters (same as NetworkMap)
function precisionBitsToRadius(precisionBits?: number): number {
  if (!precisionBits || precisionBits <= 0) return 0;
  
  const precisionTable: { [bits: number]: number } = {
    10: 23300, 11: 11700, 12: 5800, 13: 2900, 14: 1500, 15: 729,
    16: 364, 17: 182, 18: 91, 19: 45, 20: 23, 21: 11, 22: 6,
    23: 3, 24: 1.5, 25: 0.7, 26: 0.4, 27: 0.2, 28: 0.1,
    29: 0.05, 30: 0.025, 31: 0.01, 32: 0.005,
  };
  
  if (precisionTable[precisionBits]) {
    return precisionTable[precisionBits];
  }
  
  if (precisionBits < 10) {
    return 23300 * Math.pow(2, 10 - precisionBits);
  } else if (precisionBits > 32) {
    return 0.005;
  } else {
    const lowerBits = Math.floor(precisionBits);
    const upperBits = Math.ceil(precisionBits);
    
    if (lowerBits === upperBits) {
      return precisionTable[lowerBits] || 0;
    }
    
    const lowerRadius = precisionTable[lowerBits] || 0;
    const upperRadius = precisionTable[upperBits] || 0;
    const fraction = precisionBits - lowerBits;
    
    return lowerRadius + (upperRadius - lowerRadius) * fraction;
  }
}

export function NodeInfoPanel({ node, title, borderColor, onClose, onNavigateToMap }: NodeInfoPanelProps) {
  const latencyStatusLabel = (() => {
    if (node.latency_reachable === true) {
      return { label: 'Reachable', className: 'text-green-600 font-medium' };
    }
    if (node.latency_reachable === false) {
      return { label: 'Unreachable', className: 'text-red-600 font-medium' };
    }
    return { label: 'No recent probe', className: 'text-gray-500' };
  })();

  const latencyLabel = (() => {
    if (node.latency_ms === null || node.latency_ms === undefined) {
      return 'N/A';
    }
    return `${node.latency_ms} ms`;
  })();

  return (
    <div 
      className="rounded-lg border shadow-sm p-6 transform transition-all duration-300 ease-in-out max-h-[80vh] overflow-y-auto" 
      style={{ backgroundColor: '#ffffff', borderColor, borderWidth: '2px' }}
    >
      <div className="flex items-center justify-between mb-6">
        <div>
          <h4 className="text-sm font-medium mb-1" style={{ color: borderColor }}>
            {title}
          </h4>
          <h3 className="text-xl font-semibold" style={{ color: '#111827' }}>
            {node.short_name && node.long_name 
              ? `${node.short_name} - ${node.long_name}`
              : node.short_name || node.long_name || `${node.node_id}`}
          </h3>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="p-2 rounded-full transition-colors hover:bg-gray-100"
            style={{ backgroundColor: 'transparent', color: '#111827' }}
            title="Close"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      <NodeActionButtons 
        nodeId={node.node_id}
        size="sm"
        className="mb-6"
        onBeforeNavigate={onClose}
        currentTabOverride="network"
      />
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Basic Information */}
        <div className="space-y-4">
          <h4 className="font-medium border-b pb-2 flex items-center" style={{ color: '#111827', borderColor: '#e5e7eb' }}>
            <Wifi className="h-4 w-4 mr-2" style={{ color: borderColor }} />
            Basic Information
          </h4>
          
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span style={{ color: '#4b5563' }}>Node ID:</span>
              <span className="font-mono text-xs" style={{ color: '#111827' }}>
                {node.node_id}
              </span>
            </div>

            <div className="flex items-center justify-between text-sm">
              <span style={{ color: '#4b5563' }}>Short Name:</span>
              <span style={{ color: '#111827' }}>
                {node.short_name || 'N/A'}
              </span>
            </div>

            <div className="flex items-center justify-between text-sm">
              <span style={{ color: '#4b5563' }}>Long Name:</span>
              <span style={{ color: '#111827' }}>
                {node.long_name || 'N/A'}
              </span>
            </div>

            {node.hw_model && (
              <div className="flex items-center justify-between text-sm">
                <span style={{ color: '#4b5563' }}>Hardware:</span>
                <span style={{ color: '#111827' }}>
                  {node.hw_model}
                </span>
              </div>
            )}

            <div className="flex items-center justify-between text-sm">
              <span style={{ color: '#4b5563' }}>Role:</span>
              <span className="capitalize" style={{ color: '#111827' }}>
                {node.role || 'Unknown'}
              </span>
            </div>
          </div>
        </div>

        {/* Position Information */}
        <div className="space-y-4">
          <h4 className="font-medium border-b pb-2 flex items-center" style={{ color: '#111827', borderColor: '#e5e7eb' }}>
            <MapPin className="h-4 w-4 mr-2" style={{ color: borderColor }} />
            Position Data
          </h4>
          
          <div className="space-y-3">
            {(node.latitude && node.longitude) ? (
              <>
                <div className="flex items-center justify-between text-sm">
                  <span style={{ color: '#4b5563' }}>Coordinates:</span>
                  <span className="font-mono text-xs" style={{ color: '#111827' }}>
                    {node.latitude.toFixed(6)}, {node.longitude.toFixed(6)}
                  </span>
                </div>
                
                {node.altitude && (
                  <div className="flex items-center justify-between text-sm">
                    <span style={{ color: '#4b5563' }}>Altitude:</span>
                    <span style={{ color: '#111827' }}>
                      {node.altitude.toFixed(1)}m
                    </span>
                  </div>
                )}
                
                {node.position_accuracy && (
                  <div className="flex items-center justify-between text-sm">
                    <span style={{ color: '#4b5563' }}>Accuracy:</span>
                    <span style={{ color: '#111827' }}>
                      {node.position_accuracy} bits (~{precisionBitsToRadius(node.position_accuracy).toFixed(1)}m)
                    </span>
                  </div>
                )}

                {node.location_source !== undefined && node.location_source !== null && (
                  <div className="flex items-center justify-between text-sm">
                    <span style={{ color: '#4b5563' }}>Location Source:</span>
                    <span style={{ color: '#111827' }}>
                      {formatLocationSourceLabel(node.location_source)}
                    </span>
                  </div>
                )}

                {/* View on Map Button */}
                {onNavigateToMap && (
                  <button
                    onClick={() => onNavigateToMap(node.node_id)}
                    className="w-full mt-3 px-3 py-2 text-sm font-medium text-white rounded-lg transition-all duration-200 hover:opacity-90 hover:shadow-md flex items-center justify-center space-x-2 transform hover:scale-[1.02]"
                    style={{ backgroundColor: borderColor }}
                    title="View this node on the network map"
                  >
                    <MapPin className="h-4 w-4" />
                    <span>View on Map</span>
                    <ExternalLink className="h-3 w-3" />
                  </button>
                )}
              </>
            ) : (
              <div className="flex items-center text-sm" style={{ color: '#9ca3af' }}>
                <MapPin className="h-4 w-4 mr-2" />
                <span>No location data available</span>
              </div>
            )}
          </div>
        </div>

        {/* Power & System Status */}
        <div className="space-y-4">
          <h4 className="font-medium border-b pb-2 flex items-center" style={{ color: '#111827', borderColor: '#e5e7eb' }}>
            <Battery className="h-4 w-4 mr-2" style={{ color: borderColor }} />
            Power & System
          </h4>
          
          <div className="space-y-3">
            {node.battery_level && (
              <div className="flex items-center justify-between text-sm">
                <span style={{ color: '#4b5563' }}>Battery:</span>
                <span style={{ color: getBatteryColor(node.battery_level) }}>
                  {node.battery_level}%
                </span>
              </div>
            )}

            {node.voltage && (
              <div className="flex items-center justify-between text-sm">
                <span style={{ color: '#4b5563' }}>Voltage:</span>
                <span style={{ color: '#111827' }}>
                  {node.voltage}V
                </span>
              </div>
            )}

            {node.uptime_seconds && (
              <div className="flex items-center justify-between text-sm">
                <span style={{ color: '#4b5563' }}>Uptime:</span>
                <span style={{ color: '#111827' }}>
                  {formatUptime(node.uptime_seconds)}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Network Status */}
        <div className="space-y-4">
          <h4 className="font-medium border-b pb-2 flex items-center" style={{ color: '#111827', borderColor: '#e5e7eb' }}>
            <Radio className="h-4 w-4 mr-2" style={{ color: borderColor }} />
            Network Status
          </h4>
          
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span style={{ color: '#4b5563' }}>Last Seen:</span>
              <span className="text-xs" style={{ color: '#111827' }}>
                {formatDate(node.last_seen)}
              </span>
            </div>

            {node.first_seen && (
              <div className="flex items-center justify-between text-sm">
                <span style={{ color: '#4b5563' }}>First Seen:</span>
                <span className="text-xs" style={{ color: '#111827' }}>
                  {formatDate(node.first_seen)}
                </span>
              </div>
            )}

            {node.channel_utilization && (
              <div className="flex items-center justify-between text-sm">
                <span style={{ color: '#4b5563' }}>Channel Usage:</span>
                <span style={{ color: '#111827' }}>
                  {node.channel_utilization.toFixed(1)}%
                </span>
              </div>
            )}

            {node.air_util_tx && (
              <div className="flex items-center justify-between text-sm">
                <span style={{ color: '#4b5563' }}>Air Time TX:</span>
                <span style={{ color: '#111827' }}>
                  {node.air_util_tx.toFixed(1)}%
                </span>
              </div>
            )}

            <div className="flex items-center justify-between text-sm">
              <span style={{ color: '#4b5563' }}>Reachability:</span>
              <span className={latencyStatusLabel.className}>
                {latencyStatusLabel.label}
              </span>
            </div>

            <div className="flex items-center justify-between text-sm">
              <span style={{ color: '#4b5563' }}>Latency:</span>
              <span style={{ color: '#111827' }}>
                {latencyLabel}
              </span>
            </div>
          </div>
        </div>

        {/* Environmental Data */}
        {(node.temperature || node.relative_humidity || node.barometric_pressure || node.gas_resistance || node.iaq) && (
          <div className="space-y-4">
            <h4 className="font-medium border-b pb-2 flex items-center" style={{ color: '#111827', borderColor: '#e5e7eb' }}>
              <Thermometer className="h-4 w-4 mr-2" style={{ color: borderColor }} />
              Environmental
            </h4>
            
            <div className="space-y-3">
              {node.temperature && (
                <div className="flex items-center justify-between text-sm">
                  <span style={{ color: '#4b5563' }}>Temperature:</span>
                  <span style={{ color: '#111827' }}>
                    {node.temperature}°C
                  </span>
                </div>
              )}

              {node.relative_humidity && (
                <div className="flex items-center justify-between text-sm">
                  <span style={{ color: '#4b5563' }}>Humidity:</span>
                  <span style={{ color: '#111827' }}>
                    {node.relative_humidity}%
                  </span>
                </div>
              )}

              {node.barometric_pressure && (
                <div className="flex items-center justify-between text-sm">
                  <span style={{ color: '#4b5563' }}>Pressure:</span>
                  <span style={{ color: '#111827' }}>
                    {node.barometric_pressure} hPa
                  </span>
                </div>
              )}

              {node.gas_resistance && (
                <div className="flex items-center justify-between text-sm">
                  <span style={{ color: '#4b5563' }}>Gas Resistance:</span>
                  <span style={{ color: '#111827' }}>
                    {node.gas_resistance.toFixed(0)} Ω
                  </span>
                </div>
              )}

              {node.iaq && (
                <div className="flex items-center justify-between text-sm">
                  <span style={{ color: '#4b5563' }}>Air Quality:</span>
                  <span style={{ color: '#111827' }}>
                    {node.iaq}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Security & Configuration */}
        <div className="space-y-4">
          <h4 className="font-medium border-b pb-2 flex items-center" style={{ color: '#111827', borderColor: '#e5e7eb' }}>
            <Shield className="h-4 w-4 mr-2" style={{ color: borderColor }} />
            Configuration
          </h4>
          
          <div className="space-y-3">
            {node.mac_address && (
              <div className="flex items-center justify-between text-sm">
                <span style={{ color: '#4b5563' }}>MAC Address:</span>
                <span className="font-mono text-xs" style={{ color: '#111827' }}>
                  {node.mac_address}
                </span>
              </div>
            )}

            <div className="flex items-center justify-between text-sm">
              <span style={{ color: '#4b5563' }}>Licensed:</span>
              <span style={{ color: '#111827' }}>
                {node.is_licensed ? 'Yes' : 'No'}
              </span>
            </div>

            {node.is_unmessagable && (
              <div className="flex items-center justify-between text-sm">
                <span style={{ color: '#4b5563' }}>Messaging:</span>
                <span style={{ color: '#ef4444' }}>
                  Disabled
                </span>
              </div>
            )}

            {node.public_key && (
              <div className="flex items-center justify-between text-sm">
                <span style={{ color: '#4b5563' }}>Public Key:</span>
                <span className="font-mono text-xs" style={{ color: '#111827' }}>
                  {node.public_key.slice(0, 16)}...
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
