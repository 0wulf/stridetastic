'use client';

import React, { useState } from 'react';
import { 
  Edit3, 
  Settings, 
  Play, 
  Shield,
  Activity,
  Server,
  AlertTriangle,
  Plus,
  Trash2,
  Filter,
  Code,
  ToggleLeft,
  ToggleRight,
  Target,
  Layers,
  FileText,
  Hash,
  Clock
} from 'lucide-react';

interface TamperingActionsProps {
  className?: string;
}

interface ActionCardProps {
  title: string;
  description: string;
  icon: React.ComponentType<any>;
  category: string;
  onClick: () => void;
  isActive?: boolean;
  severity: 'low' | 'medium' | 'high';
}

function ActionCard({ title, description, icon: Icon, category, onClick, isActive, severity }: ActionCardProps) {
  const severityColors = {
    low: 'bg-green-50 text-green-600 border-green-200',
    medium: 'bg-yellow-50 text-yellow-600 border-yellow-200', 
    high: 'bg-red-50 text-red-600 border-red-200'
  };

  const activeSeverityColors = {
    low: 'border-green-500 bg-green-50',
    medium: 'border-yellow-500 bg-yellow-50',
    high: 'border-red-500 bg-red-50'
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

export default function TamperingActions({ className = '' }: TamperingActionsProps) {
  const [selectedAction, setSelectedAction] = useState<string | null>(null);
  const [isConfiguring, setIsConfiguring] = useState(false);
  
  // Tamper service specific state
  const [tamperRules, setTamperRules] = useState<any[]>([]);
  const [selectedTarget, setSelectedTarget] = useState('all');
  const [automationMode, setAutomationMode] = useState<'automatic' | 'manual'>('automatic');

  const tamperingActions = [
    {
      id: 'tamper-service',
      title: 'Tamper Service',
      description: 'Start an intelligent tampering service with rule-based packet interception and modification',
      icon: Shield,
      category: 'Service',
      severity: 'high' as const
    },
  ];

  const handleActionClick = (actionId: string) => {
    setSelectedAction(actionId);
    setIsConfiguring(true);
  };

  const handleStartAction = () => {
    // TODO: Implement API call to start the selected action
    console.log(`Starting tampering action: ${selectedAction}`);
    if (selectedAction === 'tamper-service') {
      console.log('Tamper rules:', tamperRules);
      console.log('Target:', selectedTarget);
      console.log('Automation mode:', automationMode);
    }
    setIsConfiguring(false);
    setSelectedAction(null);
  };

  const addTamperRule = () => {
    const newRule = {
      id: Date.now(),
      enabled: true,
      name: `Rule ${tamperRules.length + 1}`,
      condition: {
        type: 'packet_type',
        value: 'text_message'
      },
      action: {
        type: 'modify_field',
        field: 'content',
        value: ''
      }
    };
    setTamperRules([...tamperRules, newRule]);
  };

  const removeRule = (ruleId: number) => {
    setTamperRules(tamperRules.filter(rule => rule.id !== ruleId));
  };

  const updateRule = (ruleId: number, updates: any) => {
    setTamperRules(tamperRules.map(rule => 
      rule.id === ruleId ? { ...rule, ...updates } : rule
    ));
  };

  const toggleRule = (ruleId: number) => {
    updateRule(ruleId, { enabled: !tamperRules.find(r => r.id === ruleId)?.enabled });
  };

  if (isConfiguring && selectedAction) {
    const action = tamperingActions.find(a => a.id === selectedAction);
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
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Target Filter
              </label>
              <select className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="all">All Traffic</option>
                <option value="specific-node">Specific Node</option>
                <option value="message-type">Message Type</option>
                <option value="channel">Specific Channel</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Tampering Mode
              </label>
              <select className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="replace">Replace Content</option>
                <option value="modify">Modify Content</option>
                <option value="inject">Inject Additional Data</option>
                <option value="corrupt">Corrupt Data</option>
              </select>
            </div>

            {selectedAction === 'packet-manipulation' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Manipulation Rules
                </label>
                <textarea
                  placeholder="Define packet manipulation rules (JSON format)"
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            )}

            {selectedAction === 'message-tampering' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Target Field
                  </label>
                  <select className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="content">Message Content</option>
                    <option value="sender">Sender Information</option>
                    <option value="timestamp">Timestamp</option>
                    <option value="routing">Routing Information</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    New Value
                  </label>
                  <input
                    type="text"
                    placeholder="Enter replacement value"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </>
            )}

            {selectedAction === 'routing-tampering' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Routing Action
                </label>
                <select className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="redirect">Redirect Traffic</option>
                  <option value="loop">Create Routing Loop</option>
                  <option value="blackhole">Create Black Hole</option>
                  <option value="delay">Introduce Delays</option>
                </select>
              </div>
            )}

            {selectedAction === 'metadata-tampering' && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Target Metadata
                  </label>
                  <select className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="header">Packet Headers</option>
                    <option value="timestamp">Timestamps</option>
                    <option value="sequence">Sequence Numbers</option>
                    <option value="flags">Control Flags</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Tampering Method
                  </label>
                  <select className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="random">Randomize</option>
                    <option value="increment">Increment</option>
                    <option value="fixed">Set Fixed Value</option>
                    <option value="bitflip">Bit Flip</option>
                  </select>
                </div>
              </div>
            )}

            {selectedAction === 'tamper-service' && (
              <div className="space-y-6">
                {/* Service Configuration */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                    <Shield className="h-5 w-5 mr-2 text-blue-600" />
                    Service Configuration
                  </h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Target Scope
                      </label>
                      <select 
                        value={selectedTarget}
                        onChange={(e) => setSelectedTarget(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="all">All Traffic</option>
                        <option value="node">Specific Node</option>
                        <option value="channel">Specific Channel</option>
                        <option value="packet_type">Packet Type</option>
                      </select>
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Automation Mode
                      </label>
                      <div className="flex items-center space-x-4">
                        <button
                          onClick={() => setAutomationMode('automatic')}
                          className={`flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                            automationMode === 'automatic' 
                              ? 'bg-blue-100 text-blue-700' 
                              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                          }`}
                        >
                          <ToggleRight className="h-4 w-4 mr-1" />
                          Auto
                        </button>
                        <button
                          onClick={() => setAutomationMode('manual')}
                          className={`flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                            automationMode === 'manual' 
                              ? 'bg-blue-100 text-blue-700' 
                              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                          }`}
                        >
                          <ToggleLeft className="h-4 w-4 mr-1" />
                          Manual
                        </button>
                      </div>
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Intercept Mode
                      </label>
                      <select className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
                        <option value="intercept_modify">Intercept & Modify</option>
                        <option value="intercept_drop">Intercept & Drop</option>
                        <option value="intercept_delay">Intercept & Delay</option>
                        <option value="intercept_duplicate">Intercept & Duplicate</option>
                      </select>
                    </div>
                  </div>

                  {selectedTarget !== 'all' && (
                    <div className="mt-4">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Target Value
                      </label>
                      <input
                        type="text"
                        placeholder={
                          selectedTarget === 'node' ? 'Node ID (e.g., !a1b2c3d4)' :
                          selectedTarget === 'channel' ? 'Channel Number (e.g., 0)' :
                          'Packet Type (e.g., text_message, position, nodeinfo)'
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  )}
                </div>

                {/* Tampering Rules */}
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                      <Filter className="h-5 w-5 mr-2 text-green-600" />
                      Tampering Rules ({tamperRules.length})
                    </h3>
                    <button
                      onClick={addTamperRule}
                      className="flex items-center px-3 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors text-sm"
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Add Rule
                    </button>
                  </div>

                  {tamperRules.length === 0 ? (
                    <div className="bg-gray-50 border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
                      <Filter className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                      <h4 className="text-lg font-medium text-gray-900 mb-2">No Rules Defined</h4>
                      <p className="text-gray-500 mb-4">
                        Create tampering rules to define how intercepted packets should be modified
                      </p>
                      <button
                        onClick={addTamperRule}
                        className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Create First Rule
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {tamperRules.map((rule, index) => (
                        <div 
                          key={rule.id} 
                          className={`border rounded-lg p-4 transition-colors ${
                            rule.enabled ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-gray-50'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center space-x-3">
                              <button
                                onClick={() => toggleRule(rule.id)}
                                className={`flex items-center px-2 py-1 rounded text-sm font-medium ${
                                  rule.enabled 
                                    ? 'bg-green-100 text-green-700' 
                                    : 'bg-gray-100 text-gray-700'
                                }`}
                              >
                                {rule.enabled ? <ToggleRight className="h-4 w-4 mr-1" /> : <ToggleLeft className="h-4 w-4 mr-1" />}
                                {rule.enabled ? 'Enabled' : 'Disabled'}
                              </button>
                              <input
                                type="text"
                                value={rule.name}
                                onChange={(e) => updateRule(rule.id, { name: e.target.value })}
                                className="font-medium text-gray-900 bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-blue-500 rounded px-2 py-1"
                              />
                            </div>
                            <button
                              onClick={() => removeRule(rule.id)}
                              className="text-red-600 hover:text-red-800 p-1"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>

                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            {/* Condition */}
                            <div className="space-y-3">
                              <h4 className="font-medium text-gray-900 flex items-center">
                                <Target className="h-4 w-4 mr-2 text-blue-600" />
                                When (Condition)
                              </h4>
                              <div className="space-y-2">
                                <select
                                  value={rule.condition.type}
                                  onChange={(e) => updateRule(rule.id, { 
                                    condition: { ...rule.condition, type: e.target.value }
                                  })}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                                >
                                  <option value="packet_type">Packet Type</option>
                                  <option value="source_node">Source Node</option>
                                  <option value="dest_node">Destination Node</option>
                                  <option value="channel">Channel</option>
                                  <option value="content_contains">Content Contains</option>
                                  <option value="field_value">Field Value</option>
                                </select>
                                <input
                                  type="text"
                                  placeholder={
                                    rule.condition.type === 'packet_type' ? 'text_message, position, nodeinfo...' :
                                    rule.condition.type === 'source_node' ? '!a1b2c3d4' :
                                    rule.condition.type === 'dest_node' ? '!a1b2c3d4' :
                                    rule.condition.type === 'channel' ? '0, 1, 2...' :
                                    rule.condition.type === 'content_contains' ? 'search text' :
                                    'field=value'
                                  }
                                  value={rule.condition.value}
                                  onChange={(e) => updateRule(rule.id, { 
                                    condition: { ...rule.condition, value: e.target.value }
                                  })}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                                />
                              </div>
                            </div>

                            {/* Action */}
                            <div className="space-y-3">
                              <h4 className="font-medium text-gray-900 flex items-center">
                                <Edit3 className="h-4 w-4 mr-2 text-orange-600" />
                                Then (Action)
                              </h4>
                              <div className="space-y-2">
                                <select
                                  value={rule.action.type}
                                  onChange={(e) => updateRule(rule.id, { 
                                    action: { ...rule.action, type: e.target.value }
                                  })}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                                >
                                  <option value="modify_field">Modify Field</option>
                                  <option value="replace_content">Replace Content</option>
                                  <option value="inject_data">Inject Data</option>
                                  <option value="corrupt_data">Corrupt Data</option>
                                  <option value="delay_packet">Delay Packet</option>
                                  <option value="drop_packet">Drop Packet</option>
                                  <option value="duplicate_packet">Duplicate Packet</option>
                                </select>
                                
                                {(rule.action.type === 'modify_field' || rule.action.type === 'replace_content' || rule.action.type === 'inject_data') && (
                                  <div className="grid grid-cols-2 gap-2">
                                    <select
                                      value={rule.action.field || ''}
                                      onChange={(e) => updateRule(rule.id, { 
                                        action: { ...rule.action, field: e.target.value }
                                      })}
                                      className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                                    >
                                      <option value="">Select Field</option>
                                      <option value="content">Message Content</option>
                                      <option value="from">From Node</option>
                                      <option value="to">To Node</option>
                                      <option value="channel">Channel</option>
                                      <option value="timestamp">Timestamp</option>
                                      <option value="latitude">Latitude</option>
                                      <option value="longitude">Longitude</option>
                                      <option value="short_name">Short Name</option>
                                      <option value="long_name">Long Name</option>
                                    </select>
                                    <input
                                      type="text"
                                      placeholder="New value"
                                      value={rule.action.value || ''}
                                      onChange={(e) => updateRule(rule.id, { 
                                        action: { ...rule.action, value: e.target.value }
                                      })}
                                      className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                                    />
                                  </div>
                                )}

                                {rule.action.type === 'delay_packet' && (
                                  <input
                                    type="number"
                                    placeholder="Delay (seconds)"
                                    value={rule.action.value || ''}
                                    onChange={(e) => updateRule(rule.id, { 
                                      action: { ...rule.action, value: e.target.value }
                                    })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                                  />
                                )}

                                {rule.action.type === 'corrupt_data' && (
                                  <select
                                    value={rule.action.value || ''}
                                    onChange={(e) => updateRule(rule.id, { 
                                      action: { ...rule.action, value: e.target.value }
                                    })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                                  >
                                    <option value="">Select Corruption Type</option>
                                    <option value="bit_flip">Bit Flip</option>
                                    <option value="random_bytes">Random Bytes</option>
                                    <option value="truncate">Truncate</option>
                                    <option value="scramble">Scramble</option>
                                  </select>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Rule Preview */}
                          <div className="mt-4 p-3 bg-gray-100 rounded-md">
                            <div className="flex items-center text-sm text-gray-600">
                              <Code className="h-4 w-4 mr-2" />
                              <span className="font-mono">
                                IF {rule.condition.type}=&quot;{rule.condition.value}&quot; THEN {rule.action.type}
                                {rule.action.field && ` ${rule.action.field}`}
                                {rule.action.value && `=&quot;${rule.action.value}&quot;`}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Advanced Options */}
                <div className="bg-blue-50 rounded-lg p-4">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                    <Settings className="h-5 w-5 mr-2 text-blue-600" />
                    Advanced Options
                  </h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Rule Execution
                      </label>
                      <select className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
                        <option value="first_match">First Match Only</option>
                        <option value="all_matches">All Matching Rules</option>
                        <option value="priority_order">Priority Order</option>
                      </select>
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Logging Level
                      </label>
                      <select className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
                        <option value="minimal">Minimal</option>
                        <option value="detailed">Detailed</option>
                        <option value="full">Full (Debug)</option>
                      </select>
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Rate Limiting
                      </label>
                      <input
                        type="number"
                        placeholder="Max packets/second"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Probability (%)
                </label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  defaultValue="100"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Duration (minutes)
                </label>
                <input
                  type="number"
                  min="1"
                  defaultValue="5"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
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
                className={`px-4 py-2 text-white rounded-md transition-colors flex items-center space-x-2 ${
                  selectedAction === 'tamper-service' 
                    ? 'bg-green-600 hover:bg-green-700' 
                    : 'bg-red-600 hover:bg-red-700'
                }`}
              >
                <Play className="h-4 w-4" />
                <span>
                  {selectedAction === 'tamper-service' ? 'Start Tamper Service' : 'Start Tampering'}
                </span>
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
          <div className="h-8 w-8 bg-yellow-100 rounded-lg flex items-center justify-center">
            <Edit3 className="h-5 w-5 text-yellow-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Tampering Actions</h1>
        </div>
        <p className="text-gray-600">
          Intercept and modify network traffic to test data integrity and tamper detection mechanisms. 
          These actions can cause significant network disruption.
        </p>
      </div>

      {/* Tampering Actions */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Available Tampering Attacks</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {tamperingActions.map((action) => (
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
              Tampering attacks can severely disrupt network communications and compromise data integrity. 
              These actions should only be performed on isolated test networks or with explicit authorization. 
              Unauthorized tampering may violate laws and regulations.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
