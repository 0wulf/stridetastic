// ...existing code...
import React, { useState } from 'react';
import type { Interface } from '@/types/interface';
import { X } from 'lucide-react';
import { apiClient } from '@/lib/api';

interface InterfaceDetailsModalProps {
  iface: Interface;
  isOpen: boolean;
  onClose: () => void;
  onStatusChange?: () => void;
}

export default function InterfaceDetailsModal({ iface, isOpen, onClose, onStatusChange }: InterfaceDetailsModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleRestart = async () => {
    setLoading(true); setError(null); setSuccess(null);
    try {
      await apiClient.restartInterface(iface.id);
      setSuccess('Interface restarted');
      if (onStatusChange) onStatusChange();
      setTimeout(() => { setSuccess(null); onClose(); }, 800);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to restart interface');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen || !iface) return null;

  const handleStart = async () => {
    setLoading(true); setError(null); setSuccess(null);
    try {
      await apiClient.startInterface(iface.id);
      setSuccess('Interface started');
      if (onStatusChange) onStatusChange();
      setTimeout(() => { setSuccess(null); onClose(); }, 800);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to start interface');
    } finally {
      setLoading(false);
    }
  };

  const handleStop = async () => {
    setLoading(true); setError(null); setSuccess(null);
    try {
      await apiClient.stopInterface(iface.id);
      setSuccess('Interface stopped');
      if (onStatusChange) onStatusChange();
      setTimeout(() => { setSuccess(null); onClose(); }, 800);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to stop interface');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 p-3 sm:p-4 pointer-events-none">
      <div className="absolute inset-0 pointer-events-auto" onClick={onClose} />
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto pointer-events-auto relative z-10">
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-gray-200">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg sm:text-xl font-bold text-gray-900 truncate">
              {iface.display_name || iface.name || `Interface ${iface.id}`}
            </h2>
            <p className="text-xs sm:text-sm text-gray-500 truncate">ID: {iface.id}</p>
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
        <div className="p-4 sm:p-6 space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Name:</span>
              <span className="text-sm font-medium text-gray-900">{iface.display_name}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Type:</span>
              <span className="text-sm font-medium text-gray-900">{iface.name}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Status:</span>
              <span className={`text-sm font-medium ${iface.status === 'RUNNING' ? 'text-green-600' : iface.status === 'ERROR' ? 'text-red-600' : 'text-gray-900'}`}>{iface.status}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">MQTT Topic:</span>
              <span className="text-sm font-medium text-gray-900">{iface.mqtt_topic ?? '-'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Last Connected:</span>
              <span className="text-sm font-medium text-gray-900">{iface.last_connected ? new Date(iface.last_connected).toLocaleString() : '-'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Error:</span>
              <span className="text-sm font-medium text-red-600">{iface.last_error ?? '-'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Enabled:</span>
              <span className={`text-sm font-medium ${iface.is_enabled ? 'text-green-600' : 'text-red-600'}`}>{iface.is_enabled ? 'Yes' : 'No'}</span>
            </div>
            {/* Start/Stop/Restart Controls */}
            {iface.is_enabled && (
              <div className="flex items-center gap-3 pt-2">
                {iface.status !== 'RUNNING' && (
                  <button
                    className="px-4 py-2 rounded bg-green-600 text-white font-semibold hover:bg-green-700 disabled:opacity-50 transition-colors"
                    onClick={handleStart}
                    disabled={loading}
                    title="Start interface"
                  >
                    {loading && iface.status !== 'STOPPED' ? 'Starting...' : 'Start'}
                  </button>
                )}
                {iface.status !== 'STOPPED' && (
                  <button
                    className="px-4 py-2 rounded bg-red-600 text-white font-semibold hover:bg-red-700 disabled:opacity-50 transition-colors"
                    onClick={handleStop}
                    disabled={loading}
                    title="Stop interface"
                  >
                    {loading && iface.status !== 'RUNNING' ? 'Stopping...' : 'Stop'}
                  </button>
                )}
                <button
                  className="px-4 py-2 rounded bg-yellow-500 text-white font-semibold hover:bg-yellow-600 disabled:opacity-50 transition-colors"
                  onClick={handleRestart}
                  disabled={loading}
                  title="Restart interface"
                >
                  {loading ? 'Restarting...' : 'Restart'}
                </button>
              </div>
            )}
            {error && <div className="text-sm text-red-600 pt-2">{error}</div>}
            {success && <div className="text-sm text-green-600 pt-2">{success}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
