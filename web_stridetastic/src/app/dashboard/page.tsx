'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import Overview from '@/components/Overview';
import NetworkGraph from '@/components/NetworkGraph';
import NetworkMap from '@/components/NetworkMap';
import { MapFocusProvider, useMapFocus } from '@/contexts/MapFocusContext';
import ActionsPanel from '@/components/actions/PublishingActions';
import CapturesPanel from '@/components/CapturesPanel';
import VirtualNodesPanel from '@/components/VirtualNodesPanel';
import LinksPanel from '@/components/LinksPanel';
import KeyHealthPanel from '@/components/KeyHealthPanel';

function DashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState('overview');
  const { setFocusedNodeId, setShouldFocusOnLoad } = useMapFocus();

  useEffect(() => {
    const rawTabParam = searchParams.get('tab');
    const tabParam = rawTabParam && rawTabParam.startsWith('actions-') ? 'actions' : rawTabParam;
    if (tabParam && tabParam !== activeTab) {
      setActiveTab(tabParam);
    }
    if (!tabParam && activeTab !== 'overview') {
      setActiveTab('overview');
    }
  }, [searchParams, activeTab]);

  const updateQueryParams = useCallback((nextTab: string, extras?: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams ? searchParams.toString() : '');
    params.delete('returnTab');
    if (nextTab === 'overview') {
      params.delete('tab');
    } else {
      params.set('tab', nextTab);
    }
    if (nextTab !== 'actions') {
      params.delete('action');
      params.delete('targetNode');
      params.delete('sourceNode');
    }
    if (extras) {
      Object.entries(extras).forEach(([key, value]) => {
        if (value === null) {
          params.delete(key);
        } else {
          params.set(key, value);
        }
      });
    }

    const queryString = params.toString();
    router.push(queryString ? `?${queryString}` : '?', { scroll: false });
  }, [router, searchParams]);

  const handleTabChange = useCallback((tab: string) => {
    setActiveTab(tab);
    updateQueryParams(tab);
  }, [updateQueryParams]);

  const handleNavigateToMap = (nodeId: string) => {
    setFocusedNodeId(nodeId);
    setShouldFocusOnLoad(true);
    setActiveTab('network-map');
    updateQueryParams('network-map');
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'overview':
        return <Overview />;
      case 'network':
        return <NetworkGraph className="h-full" onNavigateToMap={handleNavigateToMap} />;
      case 'network-map':
        return <NetworkMap className="h-full" />;
      case 'virtual-nodes':
        return <VirtualNodesPanel />;
      case 'key-health':
        return <KeyHealthPanel />;
      case 'captures':
        return <CapturesPanel />;
      case 'links':
        return <LinksPanel />;
      case 'actions':
        return <ActionsPanel />;
      default:
        return <Overview />;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 lg:pl-64">
      <Sidebar activeTab={activeTab} onTabChange={handleTabChange} />

      {/* Main content */}
      <div className="w-full min-w-0">
        <main className="p-3 sm:p-4 md:p-6">
          {renderContent()}
        </main>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <MapFocusProvider>
      <Suspense fallback={<div className="flex min-h-screen items-center justify-center text-gray-500">Loading dashboard...</div>}>
        <DashboardContent />
      </Suspense>
    </MapFocusProvider>
  );
}
