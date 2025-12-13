'use client';

import React, { useState } from 'react';
import { 
  Shield, 
  Key, 
  Lock, 
  UnlockKeyhole, 
  Play, 
  AlertTriangle,
  Crown,
  Bug,
  Settings,
  FileText
} from 'lucide-react';

interface EscalationActionsProps {
  className?: string;
}

interface ActionCardProps {
  title: string;
  description: string;
  icon: React.ComponentType<any>;
  category: string;
  onClick: () => void;
  isActive?: boolean;
  severity: 'medium' | 'high' | 'critical';
}

function ActionCard({ title, description, icon: Icon, category, onClick, isActive, severity }: ActionCardProps) {
  const severityColors = {
    medium: 'bg-yellow-50 text-yellow-600 border-yellow-200', 
    high: 'bg-orange-50 text-orange-600 border-orange-200',
    critical: 'bg-red-50 text-red-600 border-red-200'
  };

  const activeSeverityColors = {
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

export default function EscalationActions({ className = '' }: EscalationActionsProps) {
  const [selectedAction, setSelectedAction] = useState<string | null>(null);
  const [isConfiguring, setIsConfiguring] = useState(false);

  const escalationActions = [
    {
      id: 'admin-channel-aes',
      title: 'Admin Channel Exploitation (AES)',
      description: 'Exploit legacy admin channels using known or extracted AES encryption keys',
      icon: Key,
      category: 'Cryptographic Attack',
      severity: 'critical' as const
    },
  ];

  const handleActionClick = (actionId: string) => {
    setSelectedAction(actionId);
    setIsConfiguring(true);
  };

  const handleStartAction = () => {
    // TODO: Implement API call to start the selected action
    console.log(`Starting escalation action: ${selectedAction}`);
    setIsConfiguring(false);
    setSelectedAction(null);
  };

  if (isConfiguring && selectedAction) {
    const action = escalationActions.find(a => a.id === selectedAction);
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
                Target Node(s)
              </label>
              <input
                type="text"
                placeholder="Node ID or comma-separated list"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {selectedAction === 'admin-channel-aes' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Admin Channel Key
                  </label>
                  <input
                    type="text"
                    placeholder="AES key (hex format)"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Key Source
                  </label>
                  <select className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="manual">Manual Entry</option>
                    <option value="extracted">Extracted from Device</option>
                    <option value="bruteforce">Brute Force Attack</option>
                    <option value="dictionary">Dictionary Attack</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Admin Commands
                  </label>
                  <textarea
                    placeholder="List of admin commands to execute (one per line)"
                    rows={4}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </>
            )}

            {selectedAction === 'admin-channel-cve' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    CVE Exploitation Method
                  </label>
                  <select className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="plaintext-bypass">Plaintext Bypass (CVE-2024-41125)</option>
                    <option value="auth-bypass">Authentication Bypass</option>
                    <option value="channel-hijack">Channel Hijacking</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Target Firmware Version
                  </label>
                  <select className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="auto">Auto-detect</option>
                    <option value="2.5.x">Meshtastic 2.5.x</option>
                    <option value="2.4.x">Meshtastic 2.4.x</option>
                    <option value="2.3.x">Meshtastic 2.3.x</option>
                    <option value="older">Older versions</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Exploit Payload
                  </label>
                  <textarea
                    placeholder="Custom exploit payload or commands"
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </>
            )}

            {selectedAction === 'privilege-escalation' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Escalation Method
                  </label>
                  <select className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="buffer-overflow">Buffer Overflow</option>
                    <option value="race-condition">Race Condition</option>
                    <option value="permission-bypass">Permission Bypass</option>
                    <option value="memory-corruption">Memory Corruption</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Target Service
                  </label>
                  <select className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="mesh-service">Mesh Service</option>
                    <option value="admin-service">Admin Service</option>
                    <option value="position-service">Position Service</option>
                    <option value="routing-service">Routing Service</option>
                  </select>
                </div>
              </>
            )}

            {selectedAction === 'firmware-exploit' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Firmware Target
                  </label>
                  <select className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="bootloader">Bootloader</option>
                    <option value="main-firmware">Main Firmware</option>
                    <option value="radio-firmware">Radio Firmware</option>
                    <option value="ble-stack">BLE Stack</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Exploit Type
                  </label>
                  <select className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="code-injection">Code Injection</option>
                    <option value="return-oriented">Return-Oriented Programming</option>
                    <option value="heap-spray">Heap Spraying</option>
                    <option value="rop-chain">ROP Chain</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Payload File
                  </label>
                  <input
                    type="file"
                    accept=".bin,.hex,.elf"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Persistence Method
                </label>
                <select className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="none">No Persistence</option>
                  <option value="config-modify">Modify Configuration</option>
                  <option value="firmware-patch">Firmware Patching</option>
                  <option value="backdoor">Install Backdoor</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Cleanup After
                </label>
                <select className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="false">No Cleanup</option>
                  <option value="true">Full Cleanup</option>
                  <option value="partial">Partial Cleanup</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Max Attempts
                </label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  defaultValue="3"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Timeout (minutes)
                </label>
                <input
                  type="number"
                  min="1"
                  max="30"
                  defaultValue="10"
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
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors flex items-center space-x-2"
              >
                <Play className="h-4 w-4" />
                <span>Execute Exploit</span>
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
          <div className="h-8 w-8 bg-purple-100 rounded-lg flex items-center justify-center">
            <Shield className="h-5 w-5 text-purple-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Privilege Escalation Actions</h1>
        </div>
        <p className="text-gray-600">
          Exploit vulnerabilities and misconfigurations to gain elevated privileges and administrative access. 
          These actions target critical security boundaries.
        </p>
      </div>

      {/* Escalation Actions */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Available Privilege Escalation Attacks</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {escalationActions.map((action) => (
            <ActionCard
              key={action.id}
              {...action}
              onClick={() => handleActionClick(action.id)}
              isActive={selectedAction === action.id}
            />
          ))}
        </div>
      </div>

      {/* CVE Information */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start space-x-3">
          <FileText className="h-5 w-5 text-blue-600 mt-0.5" />
          <div>
            <h3 className="font-medium text-blue-900">CVE-2024-41125 Information</h3>
            <p className="text-sm text-blue-700 mt-1">
              This vulnerability affects Meshtastic firmware versions 2.5 and earlier, allowing attackers to bypass 
              admin channel encryption and execute administrative commands in plaintext. This can lead to complete 
              compromise of affected nodes.
            </p>
          </div>
        </div>
      </div>

      {/* Critical Warning */}
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <div className="flex items-start space-x-3">
          <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5" />
          <div>
            <h3 className="font-medium text-red-900">Extreme Security Warning</h3>
            <p className="text-sm text-red-700 mt-1">
              Privilege escalation attacks can result in complete compromise of target systems and permanent security breaches. 
              These attacks should only be performed on systems you own or have explicit written authorization to test. 
              Unauthorized privilege escalation attacks are serious criminal offenses in most jurisdictions and may result 
              in severe legal consequences including imprisonment.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
