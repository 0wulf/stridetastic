import { useState, useEffect, useCallback } from 'react';
import { Node, Edge, ForceGraphNode, ForceGraphLink } from '@/types';
import { apiClient } from '@/lib/api';
import { transformNetworkData } from '@/lib/networkTransforms';
import { ActivityTimeRange } from '@/lib/activityFilters';

interface NetworkDataState {
  graphData: { nodes: ForceGraphNode[], links: ForceGraphLink[] };
  rawData: { nodes: Node[], edges: Edge[] };
  virtualEdgeSet: Set<string>;
  isLoading: boolean;
  error: string | null;
  lastUpdate: Date | null;
}

export function useNetworkData(
  graph_or_map: 'graph' | 'map',
  showBidirectionalOnly: boolean, 
  showMqttInterface: boolean = true, 
  forceBidirectional: boolean = false, 
  excludeMultiHop: boolean = false,
  nodeActivityFilter: ActivityTimeRange = 'all',
  linkActivityFilter: ActivityTimeRange = 'all'
) {
  const [state, setState] = useState<NetworkDataState>({
    graphData: { nodes: [], links: [] },
    rawData: { nodes: [], edges: [] },
    virtualEdgeSet: new Set(),
    isLoading: true,
    error: null,
    lastUpdate: null,
  });

  const fetchData = useCallback(async () => {
    try {
      setState(prev => ({ ...prev, isLoading: true, error: null }));
      
      const [nodesResponse, edgesResponse] = await Promise.all([
        apiClient.getNodes({ last: nodeActivityFilter }),
        apiClient.getEdges({ last: linkActivityFilter })
      ]);
      
      const rawData = { nodes: nodesResponse.data, edges: edgesResponse.data };
      const transformed = transformNetworkData(
        graph_or_map,
        rawData.nodes, 
        rawData.edges, 
        showBidirectionalOnly, 
        showMqttInterface, 
        forceBidirectional, 
        excludeMultiHop,
        nodeActivityFilter,
        linkActivityFilter
      );
      
      setState(prev => ({
        ...prev,
        graphData: { nodes: transformed.nodes, links: transformed.links },
        rawData,
        virtualEdgeSet: transformed.virtualEdgeSet,
        lastUpdate: new Date(),
        isLoading: false,
      }));
    } catch (err) {
      console.error('Error fetching data:', err);
      setState(prev => ({
        ...prev,
        error: 'Failed to load network data',
        isLoading: false,
      }));
    }
  }, [graph_or_map, showBidirectionalOnly, showMqttInterface, forceBidirectional, excludeMultiHop, nodeActivityFilter, linkActivityFilter]);

  // Re-transform data when edge settings change
  useEffect(() => {
    if (state.rawData.nodes.length > 0) {
      const transformed = transformNetworkData(
        graph_or_map,
        state.rawData.nodes, 
        state.rawData.edges, 
        showBidirectionalOnly,
        showMqttInterface,
        forceBidirectional,
        excludeMultiHop,
        nodeActivityFilter,
        linkActivityFilter
      );
      setState(prev => ({
        ...prev,
        graphData: { nodes: transformed.nodes, links: transformed.links },
        virtualEdgeSet: transformed.virtualEdgeSet,
      }));
    }
  }, [graph_or_map, showBidirectionalOnly, showMqttInterface, forceBidirectional, excludeMultiHop, nodeActivityFilter, linkActivityFilter, state.rawData]);

  // Initial data fetch
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    ...state,
    refetch: fetchData,
  };
}
