'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { X, Hash, Users, Clock, Shield, MessageSquare, Activity } from 'lucide-react';
import { ChannelDetail, Channel, Node } from '@/types';
import { apiClient } from '@/lib/api';
import { getNodeActivityColor } from '@/lib/networkTransforms';
import NodeDetailsModal from './NodeDetailsModal';

interface ChannelDetailsModalProps {
  channel: Channel;
  isOpen: boolean;
  onClose: () => void;
  interfaces?: any[];
  onInterfaceClick?: (iface: any) => void;
  members?: any[];
}

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleString();
}

function getAESKeyInfo(psk?: string) {
  if (!psk) {
    return {
      color: 'text-green-600',
      bgColor: 'bg-green-100',
      iconColor: 'text-green-600',
      text: 'Encrypted',
      key: ''
    };
  }
  
  if (psk === 'AQ==') {
    return {
      color: 'text-red-600',
      bgColor: 'bg-red-100',
      iconColor: 'text-red-600',
      text: 'Default Key',
      key: psk
    };
  }
  
  return {
    color: 'text-yellow-600',
    bgColor: 'bg-yellow-100',
    iconColor: 'text-yellow-600',
    text: 'Custom Key',
    key: psk
  };
}

export default function ChannelDetailsModal({ channel, isOpen, onClose, interfaces = [], onInterfaceClick }: ChannelDetailsModalProps) {
  const [channelDetails, setChannelDetails] = useState<ChannelDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [isNodeModalOpen, setIsNodeModalOpen] = useState(false);

  const handleNodeClick = (node: Node) => {
    setSelectedNode(node);
    setIsNodeModalOpen(true);
  };

  const handleCloseNodeModal = () => {
    setIsNodeModalOpen(false);
    setSelectedNode(null);
  };

  const fetchChannelDetails = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await apiClient.getChannel(channel.channel_id, channel.channel_num);
      setChannelDetails(response.data);
    } catch (err) {
      console.error('Failed to fetch channel details:', err);
      setError('Failed to load channel details');
    } finally {
      setIsLoading(false);
    }
  }, [channel?.channel_id, channel?.channel_num]);

  useEffect(() => {
    if (isOpen && channel) {
      fetchChannelDetails();
    }
  }, [isOpen, channel, fetchChannelDetails]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 flex items-center justify-center p-3 sm:p-4 z-50 pointer-events-none">
      {/* Invisible clickable area to close modal */}
      <div 
        className="absolute inset-0 pointer-events-auto"
        onClick={onClose}
      />
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden shadow-xl pointer-events-auto relative z-10">
        {/* Header */}
        <div className="px-4 sm:px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center space-x-3 min-w-0 flex-1">
            <div className="h-8 w-8 sm:h-10 sm:w-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <Hash className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-lg sm:text-xl font-semibold text-gray-900 truncate">
                Channel: {channel.channel_id}
              </h2>
              <p className="text-xs sm:text-sm text-gray-500">
                Channel Details and Statistics
              </p>
            </div>
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
        <div className="p-4 sm:p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                <p className="text-gray-600">Loading channel details...</p>
              </div>
            </div>
          ) : error ? (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-red-700">{error}</p>
            </div>
          ) : channelDetails ? (
            <div className="space-y-6">
              {/* Channel Statistics */}
              <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                <div className="bg-blue-50 rounded-lg p-4">
                  <div className="flex items-center">
                    <MessageSquare className="h-5 w-5 text-blue-600 mr-2" />
                    <span className="text-sm font-medium text-blue-800">Total Messages</span>
                  </div>
                  <p className="text-2xl font-bold text-blue-900 mt-1">{channel.total_messages}</p>
                </div>
                
                <div className="bg-green-50 rounded-lg p-4">
                  <div className="flex items-center">
                    <Users className="h-5 w-5 text-green-600 mr-2" />
                    <span className="text-sm font-medium text-green-800">Members</span>
                  </div>
                  <p className="text-2xl font-bold text-green-900 mt-1">
                    {channelDetails.members.filter(member => member.node_id !== '!ffffffff').length}
                  </p>
                </div>
                
                <div className="bg-purple-50 rounded-lg p-4">
                  <div className="flex items-center">
                    <Hash className="h-5 w-5 text-purple-600 mr-2" />
                    <span className="text-sm font-medium text-purple-800">Channel Number</span>
                  </div>
                  <p className="text-2xl font-bold text-purple-900 mt-1">{channelDetails.channel_num}</p>
                </div>
                
                <div className="bg-amber-50 rounded-lg p-4">
                  <div className="flex items-center">
                    <Activity className="h-5 w-5 text-amber-600 mr-2" />
                    <span className="text-sm font-medium text-amber-800">Status</span>
                  </div>
                  <p className="text-lg font-bold text-amber-900 mt-1">
                    {(() => {
                      const lastSeen = new Date(channel.last_seen);
                      const now = new Date();
                      const diffMinutes = Math.floor((now.getTime() - lastSeen.getTime()) / (1000 * 60));
                      
                      if (diffMinutes < 5) return 'Very Active';
                      if (diffMinutes < 60) return 'Active';
                      if (diffMinutes < 120) return 'Moderate';
                      if (diffMinutes < 1440) return 'Quiet';
                      return 'Inactive';
                    })()}
                  </p>
                </div>
              </div>

              {/* Channel Information */}
              <div className="bg-white border border-gray-200 rounded-lg">
                <div className="px-4 py-3 border-b border-gray-200">
                  <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                    <Clock className="h-5 w-5 text-gray-400 mr-2" />
                    Channel Information
                  </h3>
                </div>
                <div className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Channel ID:</span>
                    <span className="text-sm font-medium text-gray-900">{channelDetails.channel_id}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Channel Number:</span>
                    <span className="text-sm font-medium text-gray-900">{channelDetails.channel_num}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">First Seen:</span>
                    <span className="text-sm font-medium text-gray-900">{formatDate(channelDetails.first_seen)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Last Seen:</span>
                    <span className="text-sm font-medium text-gray-900">{formatDate(channelDetails.last_seen)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">AES Key:</span>
                    <div className="flex items-center">
                      <div className={`px-2 py-1 rounded-md ${getAESKeyInfo(channelDetails.psk).bgColor} mr-2`}>
                        <Shield className={`h-4 w-4 ${getAESKeyInfo(channelDetails.psk).iconColor}`} />
                      </div>
                      <div className="text-right">
                        <div className={`text-sm font-medium ${getAESKeyInfo(channelDetails.psk).color}`}>
                          {getAESKeyInfo(channelDetails.psk).text}
                        </div>
                        <div className="text-xs text-gray-500 font-mono">
                          {getAESKeyInfo(channelDetails.psk).key}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Channel Members List */}
              {channelDetails.members && channelDetails.members.length > 0 && (
                <div className="bg-white border border-gray-200 rounded-lg mt-6">
                  <div className="px-4 py-3 border-b border-gray-200">
                    <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                      <Users className="h-5 w-5 text-gray-400 mr-2" />
                      Channel Members
                    </h3>
                  </div>
                  <div className="p-4 space-y-2 max-h-64 overflow-y-auto">
                    {channelDetails.members
                      .filter(m => m.node_id !== '!ffffffff')
                      .sort((a, b) => {
                        // Sort by activity: most recent first
                        const aLast = new Date(a.last_seen || 0).getTime();
                        const bLast = new Date(b.last_seen || 0).getTime();
                        return bLast - aLast;
                      })
                      .map((member, idx) => {
                        const activityColor = getNodeActivityColor(member.last_seen);
                        const now = Date.now();
                        const lastSeen = new Date(member.last_seen).getTime();
                        const minutesAgo = Math.floor((now - lastSeen) / 1000 / 60);
                        let activityLabel = '';
                        if (minutesAgo < 1) activityLabel = 'Just now';
                        else if (minutesAgo < 60) activityLabel = `${minutesAgo}m ago`;
                        else activityLabel = `${Math.floor(minutesAgo / 60)}h ago`;
                        return (
                          <div key={member.node_id || idx} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-b-0 hover:bg-gray-50 cursor-pointer"
                            onClick={() => handleNodeClick(member)}>
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: activityColor }} title={activityLabel} />
                              <span className="text-sm font-medium text-gray-900 truncate" title={member.short_name}>{member.short_name || '-'}</span>
                              <span className="text-xs text-gray-500 truncate" title={member.long_name}>{member.long_name || '-'}</span>
                            </div>
                            <span className="text-xs text-gray-500 px-2 py-1 bg-gray-100 rounded">{member.node_id}</span>
                            <span className="text-xs text-gray-500 px-2 py-1 bg-gray-100 rounded">{activityLabel}</span>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}

      {/* Interfaces Section */}
      {Array.isArray(interfaces) && interfaces.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg mt-6">
          <div className="px-4 py-3 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center">
              <Users className="h-5 w-5 text-gray-400 mr-2" />
              Interfaces
            </h3>
          </div>
          <div className="p-4 space-y-2">
            {interfaces.map((iface) => (
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
            </div>
          ) : null}
        </div>
      </div>

      {/* Node Details Modal */}
      {selectedNode && (
        <NodeDetailsModal
          node={selectedNode}
          isOpen={isNodeModalOpen}
          onClose={handleCloseNodeModal}
        />
      )}
    </div>
  );
}
