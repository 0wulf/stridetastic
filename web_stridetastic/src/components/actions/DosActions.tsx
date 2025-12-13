'use client';

import React, { useState } from 'react';
import { 
  Zap, 
  Wifi, 
  Ban, 
  Waves, 
  Play, 
  AlertTriangle,
  Activity,
  Waypoints,
  ArrowDown10,
  Worm
} from 'lucide-react';

interface DosActionsProps {
  className?: string;
}

interface ActionCardProps {
  title: string;
  description: string;
  icon: React.ComponentType<any>;
  category: string;
  onClick: () => void;
  isActive?: boolean;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

function ActionCard({ title, description, icon: Icon, category, onClick, isActive, severity }: ActionCardProps) {
  const severityColors = {
    low: 'bg-green-50 text-green-600 border-green-200',
    medium: 'bg-yellow-50 text-yellow-600 border-yellow-200', 
    high: 'bg-orange-50 text-orange-600 border-orange-200',
    critical: 'bg-red-50 text-red-600 border-red-200'
  };

  const activeSeverityColors = {
    low: 'border-green-500 bg-green-50',
    medium: 'border-yellow-500 bg-yellow-50',
    high: 'border-orange-500 bg-orange-50',
    critical: 'border-red-500 bg-red-50'
  };

  return (
    <div 
      onClick={onClick}
      className={`
        relative bg-white rounded-lg border border-gray-200 shadow-sm p-6 cursor-pointer 
        transition-all duration-200 hover:shadow-md hover:border-blue-300
        ${isActive ? activeSeverityColors[severity] : ''}
      `}
    >
      <div className="flex items-start space-x-4">
        <div className={`
          h-12 w-12 rounded-lg flex items-center justify-center
          ${isActive ? `${severityColors[severity]}` : 'bg-blue-50 text-blue-600'}
        `}>
          <Icon className="h-6 w-6" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className={`
            text-lg font-semibold mb-2
            ${isActive ? 'text-gray-900' : 'text-gray-900'}
          `}>
            {title}
          </h3>
          <p className="text-sm text-gray-600 mb-3">{description}</p>
          <div className="flex items-center space-x-2">
            <span className={`
              inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
              ${isActive ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'}
            `}>
              {category}
            </span>
            <span className={`
              inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
              ${severityColors[severity]}
            `}>
              {severity.toUpperCase()}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DosActions({ className = '' }: DosActionsProps) {
  const [selectedAction, setSelectedAction] = useState<string | null>(null);
  const [isConfiguring, setIsConfiguring] = useState(false);

  const dosActions = [
    {
      id: 'flooding-attack',
      title: 'Network Flooding',
      description: 'Overwhelm the network with high-volume packet flooding to cause congestion',
      icon: Waves,
      category: 'Mesh Attack',
      severity: 'critical' as const
    },
    {
      id: 'hop-exhaustion',
      title: 'Hop Exhaustion Attack',
      description: 'Exhaust packet hops to avoid packet routing',
      icon: ArrowDown10,
      category: 'Routing Attack',
      severity: 'high' as const
    },
    {
      id: 'next-hop-poisoning',
      title: 'Next-Hop Poisoning',
      description: 'Inject false routing information to mislead DM network traffic',
      icon: Waypoints,
      category: 'Routing Attack',
      severity: 'high' as const
    },
    {
      id: 'selective-dropping',
      title: 'Selective Packet Dropping',
      description: 'Selectively drop critical packets to disrupt specific communications',
      icon: Ban,
      category: 'Selective Attack',
      severity: 'medium' as const
    },
    {
      id: 'channel-jamming',
      title: 'Channel Jamming',
      description: 'Jam specific communication channels with noise or interference',
      icon: Wifi,
      category: 'RF Attack',
      severity: 'high' as const
    },
    {
      id: 'malformed-packets',
      title: 'Malformed Packet Injection',
      description: 'Send malformed packets to crash or overwhelm target nodes',
      icon: Activity,
      category: 'Protocol Attack',
      severity: 'medium' as const
    },
  ];

  const handleActionClick = (actionId: string) => {
    setSelectedAction(actionId);
    setIsConfiguring(true);
  };

  const handleStartAction = () => {
    // TODO: Implement API call to start the selected action
    console.log(`Starting DoS action: ${selectedAction}`);
    setIsConfiguring(false);
    setSelectedAction(null);
  };

  if (isConfiguring && selectedAction) {
    const action = dosActions.find(a => a.id === selectedAction);
    if (!action) return null;
    
    const ActionIcon = action.icon;
    
    return (
      <div className={`space-y-6 ${className}`}>
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-3">
              <ActionIcon className="h-6 w-6 text-blue-600" />
              <h2 className="text-xl font-semibold text-gray-900">Configure {action.title}</h2>
            </div>
            <button
              onClick={() => setIsConfiguring(false)}
              className="text-gray-400 hover:text-gray-600"
            >
              ×
            </button>
          </div>

          {/* Configuration form */}
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Target Type
                </label>
                <select className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="broadcast">Entire Network</option>
                  <option value="specific-node">Specific Node</option>
                  <option value="channel">Specific Channel</option>
                  <option value="gateway">Gateway Nodes</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Target Identifier
                </label>
                <input
                  type="text"
                  placeholder="Node ID, Channel, or 'all'"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {selectedAction === 'flooding-attack' && (
              <>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Packets/Second
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="1000"
                      defaultValue="10"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Packet Size (bytes)
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="8192"
                      defaultValue="1024"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Flood Type
                    </label>
                    <select className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="udp">UDP Flood</option>
                      <option value="tcp">TCP Flood</option>
                      <option value="icmp">ICMP Flood</option>
                      <option value="mesh">Mesh Protocol Flood</option>
                    </select>
                  </div>
                </div>
              </>
            )}

            {selectedAction === 'resource-exhaustion' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Attack Vector
                  </label>
                  <select className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="battery">Battery Drain</option>
                    <option value="memory">Memory Exhaustion</option>
                    <option value="cpu">CPU Overload</option>
                    <option value="storage">Storage Filling</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Intensity Level
                    </label>
                    <select className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="maximum">Maximum</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Ramp-up Time (minutes)
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="60"
                      defaultValue="5"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              </>
            )}

            {selectedAction === 'selective-dropping' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Drop Criteria
                  </label>
                  <select className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="message-type">Message Type</option>
                    <option value="source-node">Source Node</option>
                    <option value="destination-node">Destination Node</option>
                    <option value="payload-pattern">Payload Pattern</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Drop Rate (%)
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="100"
                      defaultValue="50"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Pattern/Filter
                    </label>
                    <input
                      type="text"
                      placeholder="Pattern to match"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              </>
            )}

            {selectedAction === 'channel-jamming' && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Jamming Type
                    </label>
                    <select className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="constant">Constant Noise</option>
                      <option value="burst">Burst Jamming</option>
                      <option value="reactive">Reactive Jamming</option>
                      <option value="protocol">Protocol Jamming</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Signal Strength
                    </label>
                    <select className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="low">Low Power</option>
                      <option value="medium">Medium Power</option>
                      <option value="high">High Power</option>
                      <option value="maximum">Maximum Power</option>
                    </select>
                  </div>
                </div>
              </>
            )}

            {selectedAction === 'routing-disruption' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Disruption Method
                </label>
                <select className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="route-poisoning">Route Poisoning</option>
                  <option value="table-overflow">Routing Table Overflow</option>
                  <option value="false-advertisements">False Route Advertisements</option>
                  <option value="network-partition">Network Partitioning</option>
                </select>
              </div>
            )}

            {selectedAction === 'malformed-packets' && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Malformation Type
                    </label>
                    <select className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="header-corruption">Header Corruption</option>
                      <option value="size-mismatch">Size Mismatch</option>
                      <option value="checksum-invalid">Invalid Checksum</option>
                      <option value="protocol-violation">Protocol Violation</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Injection Rate (packets/sec)
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="100"
                      defaultValue="5"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              </>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Duration (minutes)
                </label>
                <input
                  type="number"
                  min="1"
                  max="60"
                  defaultValue="5"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Auto-Stop on Success
                </label>
                <select className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="false">No - Run Full Duration</option>
                  <option value="true">Yes - Stop When Effective</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end space-x-3 pt-4">
              <button
                onClick={() => setIsConfiguring(false)}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleStartAction}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors flex items-center space-x-2"
              >
                <Play className="h-4 w-4" />
                <span>Start Attack</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
        <div className="flex items-center space-x-3 mb-4">
          <div className="h-8 w-8 bg-red-100 rounded-lg flex items-center justify-center">
            <Zap className="h-5 w-5 text-red-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Denial of Service Actions</h1>
        </div>
        <p className="text-gray-600">
          Execute various denial of service attacks to test network resilience and availability. 
          These attacks can completely disrupt network operations.
        </p>
      </div>

      {/* DoS Actions */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Available DoS Attacks</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {dosActions.map((action) => (
            <ActionCard
              key={action.id}
              {...action}
              onClick={() => handleActionClick(action.id)}
              isActive={selectedAction === action.id}
            />
          ))}
        </div>
      </div>

      {/* Critical Warning */}
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <div className="flex items-start space-x-3">
          <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5" />
          <div>
            <h3 className="font-medium text-red-900">Critical Security Warning</h3>
            <p className="text-sm text-red-700 mt-1">
              Denial of Service attacks can completely disrupt network communications and may cause permanent damage to devices. 
              These attacks should only be performed on isolated test networks with proper authorization. 
              Unauthorized DoS attacks are illegal in most jurisdictions and may result in criminal charges.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
