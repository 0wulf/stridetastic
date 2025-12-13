'use client';

import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
  Menu,
  X,
  Map,
  Waypoints,
  LogOut,
  User,
  Home,
  Strikethrough,
  Radio,
  ShieldAlert,
  HardDrive,
  KeyRound,
  Link2,
} from 'lucide-react';

interface SidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export default function Sidebar({ activeTab, onTabChange }: SidebarProps) {
  const [isOpen, setIsOpen] = useState(true);
  const { user, logout } = useAuth();

  const menuItems = [
    { id: 'overview', label: 'Overview', icon: Home },
    { id: 'network', label: 'Network Topology', icon: Waypoints },
    { id: 'network-map', label: 'Network Map', icon: Map },
    { id: 'links', label: 'Logical Links', icon: Link2 },
    { id: 'virtual-nodes', label: 'Virtual Nodes', icon: KeyRound },
    { id: 'key-health', label: 'Key Health', icon: ShieldAlert },
    { id: 'captures', label: 'Captures', icon: HardDrive },
    { id: 'actions', label: 'Actions', icon: Radio },
  ];

  // Helper to close sidebar on mobile
  const closeSidebarOnMobile = () => {
    if (window.innerWidth < 1024) setIsOpen(false);
  };

  return (
    <>
      {/* Mobile menu button - moved to top right */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="lg:hidden fixed top-3 right-3 z-50 p-3 bg-white rounded-lg shadow-lg border touch-manipulation"
        style={{ minWidth: '44px', minHeight: '44px' }}
      >
        {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      {/* Sidebar */}
      <div className={`
        fixed inset-y-0 left-0 z-40 w-64 bg-white border-r border-gray-200 shadow-lg h-screen
        transform transition-transform duration-300 ease-in-out
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        lg:translate-x-0
        overflow-hidden
      `}>
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center px-6 py-4 border-b border-gray-200">
            <div className="flex items-center">
              <div className="h-8 w-8 bg-blue-600 rounded-lg flex items-center justify-center">
                <Strikethrough className="h-5 w-5 text-white" />
              </div>
              <span className="ml-3 text-xl font-semibold text-gray-900">
                STRIDEtastic
              </span>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-4 py-6 space-y-1">
            {menuItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;

              return (
                <button
                  key={item.id}
                  onClick={() => {
                    onTabChange(item.id);
                    closeSidebarOnMobile();
                  }}
                  className={`
                    w-full flex items-center px-3 py-3 text-sm font-medium rounded-lg transition-colors touch-manipulation
                    ${isActive 
                      ? 'bg-blue-50 text-blue-700 border-r-2 border-blue-700' 
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                    }
                  `}
                  style={{ minHeight: '44px' }}
                >
                  <Icon className={`h-5 w-5 mr-3 ${isActive ? 'text-blue-700' : ''}`} />
                  {item.label}
                </button>
              );
            })}

          </nav>

          {/* User section */}
          <div className="border-t border-gray-200 p-4 mt-auto">
            <div className="flex items-center mb-3">
              <div className="h-8 w-8 bg-gray-300 rounded-full flex items-center justify-center">
                <User className="h-4 w-4 text-gray-600" />
              </div>
              <div className="ml-3">
                <p className="text-sm font-medium text-gray-900">
                  {user?.username || 'User'}
                </p>
                <p className="text-xs text-gray-500">Administrator</p>
              </div>
            </div>
            <button
              onClick={logout}
              className="w-full flex items-center px-3 py-3 text-sm font-medium text-gray-600 rounded-lg hover:bg-gray-50 hover:text-gray-900 transition-colors touch-manipulation"
              style={{ minHeight: '44px' }}
            >
              <LogOut className="h-4 w-4 mr-3" />
              Sign Out
            </button>
          </div>
        </div>
      </div>

      {/* Overlay for mobile - transparent */}
      {isOpen && (
        <div
          className="lg:hidden fixed inset-0 z-30"
          onClick={() => setIsOpen(false)}
        />
      )}
    </>
  );
}
