'use client';

import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ForceGraphNode, ForceGraphLink } from '@/types';
import { useNetworkData } from '@/hooks/useNetworkData';
import { apiClient } from '@/lib/api';
import type { Interface } from '@/types/interface';
import { useNodeSelection } from '@/hooks/useNodeSelection';
import { useGraphDimensions } from '@/hooks/useGraphDimensions';
import { usePathFinding } from '@/hooks/usePathFinding';
import { ActivityTimeRange, isWithinTimeRange } from '@/lib/activityFilters';
import { useAutoRefresh } from '@/hooks/useAutoRefresh';
import { 
  getNodeColor, 
  getLinkColor, 
  getLinkWidth, 
  getLinkCurvature,
  getLinkLabel,
  getLinkLineDash,
  GraphStyleOptions 
} from '@/lib/graphStyles';
import { getLinkActivityColor } from '@/lib/networkTransforms';
import { GraphControls } from './GraphControls';
import { GraphCanvas, GraphCanvasRef } from './GraphCanvas';
import { PathAnalysisPanel } from './PathAnalysisPanel';
import { NodeInfoPanel } from './NodeInfoPanel';
import { getPublishingReturnFocus, clearPublishingReturnFocus } from '@/lib/publishingNavigation';
import { BRAND_ACCENT, BRAND_PRIMARY, BRAND_PRIMARY_DARK } from '@/lib/brandColors';

interface NetworkGraphProps {
  className?: string;
  onNavigateToMap?: (nodeId: string) => void;
}

export default function NetworkGraph({ className = '', onNavigateToMap }: NetworkGraphProps) {
  const [closeDropdownSignal, setCloseDropdownSignal] = useState(0);
  const graphRef = useRef<GraphCanvasRef>(null);
  const [maxHops, setMaxHops] = useState(3);
  const [showBidirectionalOnly, setShowBidirectionalOnly] = useState(false);
  const [showMqttInterface, setShowMqttInterface] = useState(false);
  const [forceBidirectional, setForceBidirectional] = useState(false);
  const [excludeMultiHop, setExcludeMultiHop] = useState(false);
  const [activityFilter, setActivityFilter] = useState<ActivityTimeRange>('24hours');
  const [showAdvanced, setShowAdvanced] = useState(false);
  // Ref for current graph data (for incremental updates)
  const currentGraphDataRef = useRef<{ nodes: ForceGraphNode[]; links: ForceGraphLink[] }>({ nodes: [], links: [] });
  // State to force memoization after incremental update
  const [graphVersion, setGraphVersion] = useState(0);
  // Removed: State to force full remount of GraphCanvas
  // Track incremental loading state for refresh button
  const [isIncrementalLoading, setIsIncrementalLoading] = useState(false);

  // Memoized nodes and links for stable reference
  const memoizedGraphData = useMemo(() => {
    void graphVersion; // tie memoization to version updates
    return {
      nodes: currentGraphDataRef.current.nodes,
      links: currentGraphDataRef.current.links,
    };
  }, [graphVersion]);
  
  // Custom hooks for different concerns
  const { dimensions, updateDimensions } = useGraphDimensions();
  const {
    graphData,
    rawData,
    virtualEdgeSet,
    isLoading,
    error,
    lastUpdate,
    refetch,
  } = useNetworkData('graph', showBidirectionalOnly, showMqttInterface, forceBidirectional, excludeMultiHop, activityFilter, activityFilter);

  // ...existing code...
  // ...existing code...
  
  const {
    selectedNode,
    selectedNodeId,
    secondSelectedNode,
    secondSelectedNodeId,
    handleNodeClick,
    clearSelection,
    swapNodes,
    selectNodeById,
  } = useNodeSelection();
  const router = useRouter();
  const searchParams = useSearchParams();
  const focusNodeParam = searchParams?.get('focusNode');
  const searchParamsString = searchParams?.toString() ?? '';
  const [pendingFocus, setPendingFocus] = useState<{ nodeId: string; source: 'query' | 'storage' } | null>(null);

  // State for interface nodes
  const [interfaceNodes, setInterfaceNodes] = useState<ForceGraphNode[]>([]);
  const [interfaceLinks, setInterfaceLinks] = useState<ForceGraphLink[]>([]);
  const [allInterfaces, setAllInterfaces] = useState<Interface[]>([]);
  const [selectedInterfaceIds, setSelectedInterfaceIds] = useState<number[]>([]);

  const zeroHopNodeIds = useMemo(() => {
    const ids = new Set<string>();
    interfaceNodes.forEach(node => ids.add(node.id));
    if (showMqttInterface) {
      ids.add('mqtt_broker');
    }
    return ids;
  }, [interfaceNodes, showMqttInterface]);

  const {
    pathsBetweenNodes,
    pathNodeSet,
    reachableNodesFromSelected,
    reachableLinksFromSelected,
  } = usePathFinding(selectedNodeId, secondSelectedNodeId, memoizedGraphData.links, maxHops, zeroHopNodeIds);

  // ...existing code...

  // Fetch interfaces and build interface nodes/links
  useEffect(() => {
    async function fetchInterfacesAndBuild() {
      try {
        const response = await apiClient.getInterfaces();
        const interfaces: Interface[] = response.data;
        setAllInterfaces(interfaces);

        const selectableIds = interfaces.reduce<number[]>((acc, iface) => {
          if (typeof iface.id === 'number' && !Number.isNaN(iface.id)) {
            acc.push(iface.id);
          }
          return acc;
        }, []);

        let nextSelectedIds = selectedInterfaceIds.filter(id => selectableIds.includes(id));

        if (nextSelectedIds.length === 0 && selectableIds.length > 0) {
          nextSelectedIds = [...selectableIds];
        }

        const selectionChanged =
          nextSelectedIds.length !== selectedInterfaceIds.length ||
          nextSelectedIds.some(id => !selectedInterfaceIds.includes(id));

        if (selectionChanged) {
          setSelectedInterfaceIds(nextSelectedIds);
        }

        const filtered = interfaces.filter(iface => typeof iface.id === 'number' && nextSelectedIds.includes(iface.id));
        const nodes: ForceGraphNode[] = filtered
          .filter(iface => typeof iface.id === 'number' && !isNaN(iface.id))
          .map((iface) => ({
            id: `iface_${iface.id}`,
            name: iface.display_name || iface.name,
            node_num: -1000 - iface.id,
            node_id: `iface_${iface.id}`,
            color: BRAND_ACCENT,
            size: 14,
            isHidden: false,
            last_seen: iface.last_connected || new Date().toISOString(),
            isInterfaceNode: true,
          }));

        // Only link nodes with RECENT self-directed edges (within activity filter) to their interfaces
        // Build a map of node_id -> latest self-link last_seen that falls within the time range
        const graphNodeIds = new Set(graphData.nodes.map(n => n.node_id));
        const selfDirectedNodeLastSeen = new Map<string, string>();
        for (const edge of rawData.edges) {
          if (
            edge.source_node_id === edge.target_node_id &&
            isWithinTimeRange(edge.last_seen, activityFilter)
          ) {
            const nodeObj = rawData.nodes.find(n => n.id === edge.source_node_id);
            if (nodeObj && graphNodeIds.has(nodeObj.node_id)) {
              const prev = selfDirectedNodeLastSeen.get(nodeObj.node_id);
              if (!prev || new Date(edge.last_seen) > new Date(prev)) {
                selfDirectedNodeLastSeen.set(nodeObj.node_id, edge.last_seen);
              }
            }
          }
        }

        const links: ForceGraphLink[] = [];
        for (const node of rawData.nodes) {
          // Only create interface links if the node has a recent self-link within the selected time range
          const selfLinkLastSeen = selfDirectedNodeLastSeen.get(node.node_id);
          if (node.interfaces && node.interfaces.length > 0 && selfLinkLastSeen) {
            const activityColor = getLinkActivityColor(selfLinkLastSeen);
            for (const ifaceName of node.interfaces) {
                const ifaceObj = filtered.find(
                  iface => iface.display_name === String(ifaceName) && iface.name === 'MQTT'
                );

                
                if (ifaceObj && typeof ifaceObj.id === 'number' && !isNaN(ifaceObj.id)) {
                  links.push({
                    source: node.node_id,
                    target: `iface_${ifaceObj.id}`,
                    rssi: 0,
                    snr: 0,
                    hops: 1,
                    // Use self-link timestamp (within range) for these interface links
                    last_seen: selfLinkLastSeen,
                    color: activityColor,
                    width: 2,
                    value: 1,
                  });
                  links.push({
                    source: `iface_${ifaceObj.id}`,
                    target: node.node_id,
                    rssi: 0,
                    snr: 0,
                    hops: 1,
                    last_seen: selfLinkLastSeen,
                    color: activityColor,
                    width: 2,
                    value: 1,
                  });
                }
              
            }
          }
        }

        // Add links for serial interfaces to their bound node
        for (const iface of filtered) {
          if (
            iface.name === 'SERIAL' &&
            typeof iface.id === 'number' &&
            iface.serial_node_id &&
            !isNaN(iface.serial_node_id)
          ) {
            const targetNode = rawData.nodes.find(n => n.id === iface.serial_node_id);
            if (targetNode) {
              const serialLastSeen = iface.last_connected || targetNode.last_seen || new Date().toISOString();
              const serialColor = getLinkActivityColor(serialLastSeen);
              links.push({
                source: `iface_${iface.id}`,
                target: targetNode.node_id,
                rssi: 0,
                snr: 0,
                hops: 1,
                last_seen: serialLastSeen,
                color: serialColor,
                width: 2,
                value: 1,
              });
              links.push({
                source: targetNode.node_id,
                target: `iface_${iface.id}`,
                rssi: 0,
                snr: 0,
                hops: 1,
                last_seen: serialLastSeen,
                color: serialColor,
                width: 2,
                value: 1,
              });
            }
          }
        }
        setInterfaceNodes(nodes);
        setInterfaceLinks(links);
      } catch (err) {
        console.log('Error fetching interfaces:', err);
        setInterfaceNodes([]);
        setInterfaceLinks([]);
        setAllInterfaces([]);
      }
    }
    fetchInterfacesAndBuild();
  }, [rawData.nodes, rawData.edges, graphData.nodes, selectedInterfaceIds, activityFilter]);

  // Merge interface nodes/links into graph, and validate links (memoized for stability)
  const mergedGraphData = useMemo(() => {
    const mergedNodes = [
      ...graphData.nodes.filter(n => !n.isMqttBroker),
      ...interfaceNodes,
    ];
    const mergedNodeIds = new Set(mergedNodes.map(n => n.id));
    const mergedLinks = [
      ...graphData.links,
      ...interfaceLinks,
    ].filter(l => mergedNodeIds.has(l.source) && mergedNodeIds.has(l.target));
    return { nodes: mergedNodes, links: mergedLinks };
  }, [graphData.nodes, graphData.links, interfaceNodes, interfaceLinks]);

  // On initial mount or when dependencies change, do an incremental update (no remount)
  useEffect(() => {
    // Diff nodes
    const currentNodesMap = new Map(currentGraphDataRef.current.nodes.map(n => [n.id, n]));
    const newNodesMap = new Map(mergedGraphData.nodes.map(n => [n.id, n]));
    // Add or update nodes
    for (const [id, newNode] of newNodesMap.entries()) {
      if (!currentNodesMap.has(id)) {
        currentGraphDataRef.current.nodes.push({ ...newNode });
      } else {
        // Update node if changed
        const oldNode = currentNodesMap.get(id);
        if (oldNode && JSON.stringify(oldNode) !== JSON.stringify(newNode)) {
          Object.assign(oldNode, newNode);
        }
      }
    }
    // Remove nodes not in new data (mutate in place)
    for (let i = currentGraphDataRef.current.nodes.length - 1; i >= 0; i--) {
      const node = currentGraphDataRef.current.nodes[i];
      if (!newNodesMap.has(node.id)) {
        currentGraphDataRef.current.nodes.splice(i, 1);
      }
    }

    // Diff links
    const currentLinksMap = new Map(currentGraphDataRef.current.links.map(l => [`${l.source}->${l.target}`, l]));
    const newLinksMap = new Map(mergedGraphData.links.map(l => [`${l.source}->${l.target}`, l]));
    // Add or update links
    for (const [key, newLink] of newLinksMap.entries()) {
      if (!currentLinksMap.has(key)) {
        currentGraphDataRef.current.links.push({ ...newLink });
      } else {
        // Update link if changed
        const oldLink = currentLinksMap.get(key);
        if (oldLink && JSON.stringify(oldLink) !== JSON.stringify(newLink)) {
          Object.assign(oldLink, newLink);
        }
      }
    }
    // Remove links not in new data (mutate in place)
    for (let i = currentGraphDataRef.current.links.length - 1; i >= 0; i--) {
      const link = currentGraphDataRef.current.links[i];
      if (!newLinksMap.has(`${link.source}->${link.target}`)) {
        currentGraphDataRef.current.links.splice(i, 1);
      }
    }

    setGraphVersion(v => v + 1); // update memoized data only
  }, [mergedGraphData]);

  // Incremental update logic for refresh (do NOT remount GraphCanvas)
  const handleIncrementalRefresh = useCallback(async () => {
    if (isIncrementalLoading || isLoading) {
      return;
    }

    setIsIncrementalLoading(true);
    try {
      await refetch();
      setTimeout(() => {
        const newMergedGraphData = {
          nodes: [
            ...graphData.nodes.filter(n => !n.isMqttBroker),
            ...interfaceNodes,
          ],
          links: [
            ...graphData.links,
            ...interfaceLinks,
          ],
        };
        // Diff nodes
        const currentNodesMap = new Map(currentGraphDataRef.current.nodes.map(n => [n.id, n]));
        const newNodesMap = new Map(newMergedGraphData.nodes.map(n => [n.id, n]));
        // Add or update nodes
        for (const [id, newNode] of newNodesMap.entries()) {
          if (!currentNodesMap.has(id)) {
            currentGraphDataRef.current.nodes.push({ ...newNode });
          } else {
            // Update node if changed
            const oldNode = currentNodesMap.get(id);
            if (oldNode && JSON.stringify(oldNode) !== JSON.stringify(newNode)) {
              Object.assign(oldNode, newNode);
            }
          }
        }
        // Remove nodes not in new data (mutate in place)
        for (let i = currentGraphDataRef.current.nodes.length - 1; i >= 0; i--) {
          const node = currentGraphDataRef.current.nodes[i];
          if (!newNodesMap.has(node.id)) {
            currentGraphDataRef.current.nodes.splice(i, 1);
          }
        }

        // Diff links
        const currentLinksMap = new Map(currentGraphDataRef.current.links.map(l => [`${l.source}->${l.target}`, l]));
        const newLinksMap = new Map(newMergedGraphData.links.map(l => [`${l.source}->${l.target}`, l]));
        // Add or update links
        for (const [key, newLink] of newLinksMap.entries()) {
          if (!currentLinksMap.has(key)) {
            currentGraphDataRef.current.links.push({ ...newLink });
          } else {
            // Update link if changed
            const oldLink = currentLinksMap.get(key);
            if (oldLink && JSON.stringify(oldLink) !== JSON.stringify(newLink)) {
              Object.assign(oldLink, newLink);
            }
          }
        }
        // Remove links not in new data (mutate in place)
        for (let i = currentGraphDataRef.current.links.length - 1; i >= 0; i--) {
          const link = currentGraphDataRef.current.links[i];
          if (!newLinksMap.has(`${link.source}->${link.target}`)) {
            currentGraphDataRef.current.links.splice(i, 1);
          }
        }

        setGraphVersion(v => v + 1); // update memoized data only
        setIsIncrementalLoading(false);
      }, 0);
    } catch (err) {
      // Fallback: full update (mutate in place)
      currentGraphDataRef.current.nodes.length = 0;
      currentGraphDataRef.current.links.length = 0;
      mergedGraphData.nodes.forEach(n => currentGraphDataRef.current.nodes.push({ ...n }));
      mergedGraphData.links.forEach(l => currentGraphDataRef.current.links.push({ ...l }));
      setGraphVersion(v => v + 1);
      setIsIncrementalLoading(false);
    }
  }, [isIncrementalLoading, isLoading, refetch, graphData.nodes, graphData.links, interfaceNodes, interfaceLinks, mergedGraphData.links, mergedGraphData.nodes]);

  useAutoRefresh(handleIncrementalRefresh, { intervalMs: 60_000 });

  // Style options for graph rendering
  const styleOptions: GraphStyleOptions = useMemo(() => ({
    selectedNodeId,
    secondSelectedNodeId,
    reachableNodes: reachableNodesFromSelected,
    reachableLinks: reachableLinksFromSelected,
    pathNodes: pathNodeSet,
    virtualEdgeSet,
    rawNodes: rawData.nodes,
    rawEdges: rawData.edges,
  }), [selectedNodeId, secondSelectedNodeId, reachableNodesFromSelected, reachableLinksFromSelected, pathNodeSet, virtualEdgeSet, rawData.nodes, rawData.edges]);

  // Zoom controls
  const handleZoomIn = useCallback(() => {
    if (graphRef.current) {
      const currentZoom = graphRef.current.zoom() as number;
      graphRef.current.zoom(currentZoom * 1.2);
    }
  }, []);

  const handleZoomOut = useCallback(() => {
    if (graphRef.current) {
      const currentZoom = graphRef.current.zoom() as number;
      graphRef.current.zoom(currentZoom / 1.2);
    }
  }, []);

  const handleZoomToFit = useCallback(() => {
    if (graphRef.current) {
      graphRef.current.zoomToFit(400);
    }
  }, []);

  // Graph rendering functions
  const getNodeColorWrapper = useCallback((node: ForceGraphNode) => {
    return getNodeColor(node, styleOptions);
  }, [styleOptions]);

  useEffect(() => {
    if (focusNodeParam) {
      setPendingFocus({ nodeId: focusNodeParam, source: 'query' });
      return;
    }

    const stored = getPublishingReturnFocus();
    if (stored && stored.originTab === 'network') {
      setPendingFocus({ nodeId: stored.nodeId, source: 'storage' });
    }
  }, [focusNodeParam]);

  useEffect(() => {
    if (!pendingFocus) {
      return;
    }

    let isActive = true;

    (async () => {
      try {
        await selectNodeById(pendingFocus.nodeId);
      } finally {
        if (!isActive) {
          return;
        }

        if (pendingFocus.source === 'query') {
          const params = new URLSearchParams(searchParamsString);
          if (params.has('focusNode')) {
            params.delete('focusNode');
            router.replace(params.toString() ? `?${params}` : '?', { scroll: false });
          }
        }

        clearPublishingReturnFocus();
        setPendingFocus(null);
      }
    })();

    return () => {
      isActive = false;
    };
  }, [pendingFocus, router, searchParamsString, selectNodeById]);

  const getLinkColorWrapper = useCallback((link: ForceGraphLink) => {
    return getLinkColor(link, styleOptions, pathsBetweenNodes);
  }, [styleOptions, pathsBetweenNodes]);

  const getLinkWidthWrapper = useCallback((link: ForceGraphLink) => {
    return getLinkWidth(link, styleOptions, pathsBetweenNodes);
  }, [styleOptions, pathsBetweenNodes]);

  const getLinkCurvatureWrapper = useCallback((link: ForceGraphLink) => {
    return getLinkCurvature(link, graphData.links);
  }, [graphData.links]);

  const getLinkLabelWrapper = useCallback((link: ForceGraphLink) => {
    return getLinkLabel(link, styleOptions);
  }, [styleOptions]);

  const getLinkLineDashWrapper = useCallback((link: ForceGraphLink) => {
    return getLinkLineDash(link, virtualEdgeSet, graphData.nodes);
  }, [virtualEdgeSet, graphData.nodes]);

  const getNodeSize = useCallback((node: ForceGraphNode) => {
    const isFirstSelected = selectedNodeId && node.id === selectedNodeId;
    const isSecondSelected = secondSelectedNodeId && node.id === secondSelectedNodeId;
    
    // MQTT Client is always larger
    if (node.isMqttBroker) {
      return 12; // Larger size for MQTT Client
    }
    
  const roleScale = node.role === 'ROUTER' && !node.isHidden ? 1.5 : 1;
  const interfaceScale = node.isInterfaceNode && !node.isHidden ? 1.5 : 1;
  const baseSize = (node.isHidden ? 2 : 10) * roleScale * interfaceScale;
    
    // For arrow positioning to work correctly, we need to account for the visual scaling
    // The renderNodeCanvas uses baseSize / Math.sqrt(globalScale), which makes visual nodes smaller
    // We adjust the nodeVal size so arrows position at the edge of the actual visual nodes
    // This factor approximates the average scaling effect across typical zoom levels
    const visualScaleFactor = 0.8;
    const adjustedSize = baseSize * visualScaleFactor;
    
    return (isFirstSelected || isSecondSelected) && !node.isHidden ? adjustedSize * 1.5 : adjustedSize;
  }, [selectedNodeId, secondSelectedNodeId]);

  // Custom node rendering with selection highlighting
  const renderNodeCanvas = useCallback((node: any, ctx: any, globalScale: any) => {
    const isFirstSelected = selectedNodeId && node.id === selectedNodeId;
    const isSecondSelected = secondSelectedNodeId && node.id === secondSelectedNodeId;
    
    let baseSize: number;
    if (node.isMqttBroker) {
      baseSize = 15; // Larger base size for MQTT Client
    } else {
      const roleScale = node.role === 'ROUTER' && !node.isHidden ? 1.5 : 1;
      const interfaceScale = node.isInterfaceNode && !node.isHidden ? 1.5 : 1;
      baseSize = (node.isHidden ? 2 : 10) * roleScale * interfaceScale;
    }
    
    const scaledBaseSize = baseSize / Math.sqrt(globalScale);
    const nodeSize = (isFirstSelected || isSecondSelected) ? scaledBaseSize * 1.5 : scaledBaseSize;
    const nodeColor = getNodeColorWrapper(node);
    
    // Draw node circle
    ctx.beginPath();
    ctx.arc(node.x, node.y, nodeSize, 0, 2 * Math.PI, false);
    ctx.fillStyle = nodeColor;
    ctx.fill();
    
    // Add special styling for MQTT Client
    if (node.isMqttBroker) {
      // Add a border to make it more distinctive
      ctx.beginPath();
      ctx.arc(node.x, node.y, nodeSize, 0, 2 * Math.PI, false);
      
      // Dim the border if the node itself is dimmed
      if (nodeColor === '#d1d5db') {
        ctx.strokeStyle = '#9ca3af'; // Dimmed border color
      } else {
        ctx.strokeStyle = '#4c1d95'; // Normal darker purple border
      }
      
      ctx.lineWidth = 2 / Math.sqrt(globalScale);
      ctx.stroke();
    }

    // Highlight virtual nodes with a dashed halo to differentiate managed identities
    if (node.isVirtual && !node.isHidden) {
      ctx.save();
      ctx.beginPath();
      const dashLength = 4 / Math.sqrt(globalScale);
      ctx.setLineDash([dashLength, dashLength]);
      ctx.strokeStyle = '#6366f1';
      ctx.lineWidth = 2 / Math.sqrt(globalScale);
      ctx.arc(node.x, node.y, nodeSize + dashLength * 0.6, 0, 2 * Math.PI, false);
      ctx.stroke();
      ctx.restore();
    }
    
    // Add selection rings
    const ringWidth = 3 / Math.sqrt(globalScale);
    const ringOffset = 2 / Math.sqrt(globalScale);
    
    if (isFirstSelected && !node.isHidden) {
      ctx.beginPath();
      ctx.arc(node.x, node.y, nodeSize + ringOffset, 0, 2 * Math.PI, false);
      ctx.strokeStyle = BRAND_PRIMARY_DARK;
      ctx.lineWidth = ringWidth;
      ctx.stroke();
    } else if (isSecondSelected && !node.isHidden) {
      ctx.beginPath();
      ctx.arc(node.x, node.y, nodeSize + ringOffset, 0, 2 * Math.PI, false);
      ctx.strokeStyle = '#059669';
      ctx.lineWidth = ringWidth;
      ctx.stroke();
    }

    // Draw label for non-hidden nodes
    if (!node.isHidden) {
      const label = node.name || node.id.slice(-4);
      const baseFontSize = node.isMqttBroker ? 14 : 12; // Larger font for MQTT Client
      const fontSize = baseFontSize / globalScale;
      
      ctx.font = `bold ${fontSize}px Sans-Serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#000000';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2 / globalScale;
      
      ctx.strokeText(label, node.x, node.y);
      ctx.fillText(label, node.x, node.y);
    }
  }, [selectedNodeId, secondSelectedNodeId, getNodeColorWrapper]);

  // Custom hover area painter to match the visible node size exactly
  const paintNodePointerArea = useCallback((node: any, color: string, ctx: any, globalScale: any) => {
    const isFirstSelected = selectedNodeId && node.id === selectedNodeId;
    const isSecondSelected = secondSelectedNodeId && node.id === secondSelectedNodeId;
    
    let baseSize: number;
    if (node.isMqttBroker) {
      baseSize = 15; // Larger base size for MQTT Client
    } else {
      baseSize = node.isHidden ? 2 : 10;
    }
    
    const scaledBaseSize = baseSize / Math.sqrt(globalScale);
    const nodeSize = (isFirstSelected || isSecondSelected) && !node.isHidden ? scaledBaseSize * 1.5 : scaledBaseSize;
    
    // Paint the hover area with the exact same size as the visible node
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(node.x, node.y, nodeSize, 0, 2 * Math.PI, false);
    ctx.fill();
  }, [selectedNodeId, secondSelectedNodeId]);

  // Filter valid paths for display - respect link directionality
  const validPaths = pathsBetweenNodes.filter(path => {
    for (let i = 0; i < path.length - 1; i++) {
      const sourceNodeId = path[i];
      const targetNodeId = path[i + 1];
      
      // Check for EXACT directional match (source -> target)
      const linkExists = memoizedGraphData.links.some(link => {
        const linkSourceId = typeof link.source === 'string' ? link.source : (link.source as any).id;
        const linkTargetId = typeof link.target === 'string' ? link.target : (link.target as any).id;
        
        // Only allow the exact direction: source -> target (no bidirectional fallback)
        return linkSourceId === sourceNodeId && linkTargetId === targetNodeId;
      });
      
      if (!linkExists) return false;
    }
    return true;
  });

  const hasNodeSelection = useMemo(() => Boolean(selectedNode || secondSelectedNode), [selectedNode, secondSelectedNode]);
  const hasPathPanel = useMemo(() => Boolean(selectedNode && secondSelectedNode), [selectedNode, secondSelectedNode]);

  const graphContainerHeight = useMemo(() => {
    if (hasPathPanel) {
      return 'calc(100vh - 24rem)';
    }
    if (hasNodeSelection) {
      return 'calc(100vh - 18rem)';
    }
    return 'calc(100vh - 6rem)';
  }, [hasNodeSelection, hasPathPanel]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => updateDimensions());
    return () => cancelAnimationFrame(frame);
  }, [graphContainerHeight, updateDimensions]);

  const graphDataForCanvas = useMemo(() => {
    return {
      nodes: memoizedGraphData.nodes,
      links: memoizedGraphData.links.map(link => ({
        ...link,
        source: typeof link.source === 'string' ? link.source : (link.source as any).id,
        target: typeof link.target === 'string' ? link.target : (link.target as any).id,
      })),
    };
  }, [memoizedGraphData]);

  return (
    <div 
      className={`relative bg-gray-50 text-gray-900 h-full min-h-screen ${className}`} 
      style={{ backgroundColor: '#f9fafb', color: '#111827' }}
    >
      {/* Header with controls */}
      <GraphControls
        maxHops={maxHops}
        onMaxHopsChange={setMaxHops}
        showBidirectionalOnly={showBidirectionalOnly}
        onShowBidirectionalOnlyChange={setShowBidirectionalOnly}
        showMqttInterface={showMqttInterface}
        onShowMqttInterfaceChange={setShowMqttInterface}
        forceBidirectional={forceBidirectional}
        onForceBidirectionalChange={setForceBidirectional}
        excludeMultiHop={excludeMultiHop}
        onExcludeMultiHopChange={setExcludeMultiHop}
        activityFilter={activityFilter}
        onActivityFilterChange={setActivityFilter}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onZoomToFit={handleZoomToFit}
        onRefresh={handleIncrementalRefresh}
  isLoading={isLoading}
  isRefreshing={isIncrementalLoading}
        lastUpdate={lastUpdate}
        nodeCount={currentGraphDataRef.current.nodes.length}
        linkCount={currentGraphDataRef.current.links.length}
        interfaces={allInterfaces}
        selectedInterfaceIds={selectedInterfaceIds}
        onSelectedInterfaceIdsChange={setSelectedInterfaceIds}
        showAdvanced={showAdvanced}
        setShowAdvanced={setShowAdvanced}
        closeDropdownSignal={closeDropdownSignal}
      />

      {/* Error message */}
      {error && (
        <div 
          className="border rounded-lg p-4 mb-4" 
          style={{ backgroundColor: '#fef2f2', borderColor: '#fecaca', color: '#b91c1c' }}
        >
          <p>{error}</p>
        </div>
      )}

      {/* Main content */}
      <div className="space-y-4">
        {/* Graph container */}
        <div 
          className="rounded-lg border shadow-sm overflow-hidden relative transition-all duration-300 ease-in-out" 
          style={{ backgroundColor: '#ffffff', borderColor: '#e5e7eb', height: graphContainerHeight, minHeight: '20rem' }}
        >
          <div id="graph-container" className="w-full h-full">
            {(memoizedGraphData.nodes.length > 0) && (
              <GraphCanvas
                ref={graphRef}
                graphData={graphDataForCanvas}
                dimensions={dimensions}
                onNodeClick={handleNodeClick}
                onBackgroundClick={() => {
                  setShowAdvanced(false);
                  setCloseDropdownSignal(s => s + 1);
                  clearSelection();
                }}
                getNodeColor={getNodeColorWrapper}
                getLinkColor={getLinkColorWrapper}
                getLinkWidth={getLinkWidthWrapper}
                getLinkCurvature={getLinkCurvatureWrapper}
                getLinkLineDash={getLinkLineDashWrapper}
                getLinkLabel={getLinkLabelWrapper}
                getNodeSize={getNodeSize}
                renderNodeCanvas={renderNodeCanvas}
                nodePointerAreaPaint={paintNodePointerArea}
              />
            )}
          </div>
          {/* Loading overlay: only show for initial/full load, not incremental refresh */}
          {isLoading && !isIncrementalLoading && (
            <div 
              className="absolute inset-0 flex items-center justify-center" 
              style={{ backgroundColor: 'rgba(255, 255, 255, 0.75)' }}
            >
              <div className="text-center">
                <div 
                  className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin mx-auto mb-2" 
                  style={{ borderColor: BRAND_PRIMARY, borderTopColor: 'transparent' }} 
                />
                <p style={{ color: '#4b5563' }}>Loading network data...</p>
              </div>
            </div>
          )}
        </div>

        {/* Node details panels */}
        {(selectedNode || secondSelectedNode) && (
          <div className="space-y-4">
            {/* Path analysis panel */}
            {selectedNode && secondSelectedNode && (
              <PathAnalysisPanel
                selectedNode={selectedNode}
                secondSelectedNode={secondSelectedNode}
                validPaths={validPaths}
                maxHops={maxHops}
                zeroHopNodes={zeroHopNodeIds}
                onSwapNodes={swapNodes}
                onClose={clearSelection}
              />
            )}
            
            {/* Node information panels */}
            <div className={`grid gap-4 ${selectedNode && secondSelectedNode ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1'}`}>
              {selectedNode && (
                <NodeInfoPanel 
                  node={selectedNode} 
                  title={selectedNode && secondSelectedNode ? "First Selected Node" : "Selected Node"}
                  borderColor={BRAND_PRIMARY}
                  onClose={selectedNode && !secondSelectedNode ? clearSelection : undefined}
                  onNavigateToMap={onNavigateToMap}
                />
              )}
              {secondSelectedNode && (
                <NodeInfoPanel 
                  node={secondSelectedNode} 
                  title="Second Selected Node"
                  borderColor="#10b981"
                  onNavigateToMap={onNavigateToMap}
                />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
