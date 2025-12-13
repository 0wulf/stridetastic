import { Node, Edge, ForceGraphNode, ForceGraphLink } from '@/types';
import { ActivityTimeRange, isWithinTimeRange } from '@/lib/activityFilters';

export interface TransformResult {
  nodes: ForceGraphNode[];
  links: ForceGraphLink[];
  virtualEdgeSet: Set<string>;
}

// Helper function to get node color based on activity (last_seen)
export function getNodeActivityColor(lastSeen: string): string {
  const now = new Date();
  const lastSeenDate = new Date(lastSeen);
  const minutesAgo = (now.getTime() - lastSeenDate.getTime()) / (1000 * 60);
  
  if (minutesAgo < 5) return '#22c55e'; // Green - very recent (< 5 min)
  if (minutesAgo < 60) return '#84cc16'; // Light green - recent (< 60 min)
  if (minutesAgo < 120) return '#eab308'; // Yellow - moderate (< 2 hours)
  if (minutesAgo < 1440) return '#f97316'; // Orange - old (< 24 hours)
  return '#ef4444'; // Red - very old (> 24 hours)
}

// Get link distance based on signal quality and type
export function getLinkDistance(edge: Edge): number {
  const isMqttLink = edge.last_rx_rssi === 0 && edge.last_rx_snr === 0;
  
  if (isMqttLink) {
    return 200; // Pink MQTT links get longest distance (loose connection)
  }
  
  // For RF links, base distance on signal quality (SNR)
  // Better SNR = shorter distance (tighter connection)
  if (edge.last_rx_snr >= 10) {
    return 60; // Green - excellent SNR, short distance (tight connection)
  } else if (edge.last_rx_snr >= 5) {
    return 80; // Light green - good SNR, short-medium distance
  } else if (edge.last_rx_snr >= 0) {
    return 100; // Yellow - acceptable SNR, medium distance
  } else if (edge.last_rx_snr >= -5) {
    return 120; // Orange - poor SNR, longer distance
  } else {
    return 140; // Red - very poor SNR, longest distance
  }
}

// Get link color based on activity timing
export function getLinkColor(edge: Edge): string {
  // All links (including MQTT) use activity timing for color
  return getLinkActivityColor(edge.last_seen);
}

// Helper function to get link color based on activity (last_seen)
export function getLinkActivityColor(lastSeen: string): string {
  const now = new Date();
  const lastSeenDate = new Date(lastSeen);
  const minutesAgo = (now.getTime() - lastSeenDate.getTime()) / (1000 * 60);
  
  if (minutesAgo < 5) return '#22c55e'; // Green - very recent (< 5 min)
  if (minutesAgo < 60) return '#84cc16'; // Light green - recent (< 60 min)
  if (minutesAgo < 120) return '#eab308'; // Yellow - moderate (< 2 hours)
  if (minutesAgo < 1440) return '#f97316'; // Orange - old (< 24 hours)
  return '#ef4444'; // Red - very old (> 24 hours)
}

// Get link width based on signal quality (SNR)
export function getLinkWidth(edge: Edge): number {
  const isMqttLink = edge.last_rx_rssi === 0 && edge.last_rx_snr === 0;
  
  if (isMqttLink) {
    return 1; // Keep MQTT links thin
  }
  
  // Base width on SNR: better SNR = thicker line
  if (edge.last_rx_snr >= 10) return 5; // Max thickness - excellent SNR
  if (edge.last_rx_snr >= 5) return 4; // Thick - good SNR
  if (edge.last_rx_snr >= 0) return 3; // Medium - acceptable SNR
  if (edge.last_rx_snr >= -5) return 2; // Thin - poor SNR
  return 1; // Min thickness - very poor SNR
}

// Transform raw data into ForceGraph format
export function transformNetworkData(
  graph_or_map: 'graph' | 'map',
  nodes: Node[], 
  edges: Edge[], 
  showBidirectionalOnly: boolean,
  showMqttInterface: boolean = true,
  forceBidirectional: boolean = false,
  excludeMultiHop: boolean = false,
  nodeActivityFilter: ActivityTimeRange = 'all',
  linkActivityFilter: ActivityTimeRange = 'all'
): TransformResult {
  // Filter nodes by activity first
  const filteredNodes = nodeActivityFilter === 'all' 
    ? nodes 
    : nodes.filter(node => isWithinTimeRange(node.last_seen, nodeActivityFilter));

  // Transform nodes
  const forceGraphNodes: ForceGraphNode[] = filteredNodes.map((node) => ({
    id: node.node_id,
    name: node.short_name || node.node_id.slice(-4),
    node_num: node.node_num,
    node_id: node.node_id,
    battery_level: node.battery_level,
    hw_model: node.hw_model,
    role: node.role,
    last_seen: node.last_seen,
    latitude: node.latitude,
    longitude: node.longitude,
    altitude: node.altitude,
    position_accuracy: node.position_accuracy,
    location_source: node.location_source,
    short_name: node.short_name,
    long_name: node.long_name,
    color: node.is_virtual ? '#6366f1' : getNodeActivityColor(node.last_seen),
    size: 10,
    isHidden: false,
    isVirtual: node.is_virtual,
    
    // Additional fields from schema
    mac_address: node.mac_address,
    is_licensed: node.is_licensed,
    public_key: node.public_key,
    is_unmessagable: node.is_unmessagable,
    voltage: node.voltage,
    channel_utilization: node.channel_utilization,
    air_util_tx: node.air_util_tx,
    uptime_seconds: node.uptime_seconds,
    temperature: node.temperature,
    relative_humidity: node.relative_humidity,
    barometric_pressure: node.barometric_pressure,
    gas_resistance: node.gas_resistance,
    iaq: node.iaq,
  latency_reachable: node.latency_reachable,
  latency_ms: node.latency_ms,
    first_seen: node.first_seen,
  }));

  // Create node ID mapping from filtered nodes
  const nodeIdMap = new Map(filteredNodes.map(node => [node.id, node.node_id]));
  
  // Get filtered node IDs for validation
  const filteredNodeIds = new Set(filteredNodes.map(node => node.id));
  
  // Find nodes with self-directed links (loops) - only consider filtered nodes and apply activity filter
  // Track the most recent last_seen per node within the selected time range
  const selfDirectedNodes = new Map<number, string>();
  edges.forEach(edge => {
    if (
      edge.source_node_id === edge.target_node_id &&
      filteredNodeIds.has(edge.source_node_id) &&
      (linkActivityFilter === 'all' || isWithinTimeRange(edge.last_seen, linkActivityFilter))
    ) {
      const prev = selfDirectedNodes.get(edge.source_node_id);
      if (!prev || new Date(edge.last_seen) > new Date(prev)) {
        selfDirectedNodes.set(edge.source_node_id, edge.last_seen);
      }
    }
  });

  // Create MQTT Client node if there are nodes with self-directed links and showMqttInterface is true
  if (selfDirectedNodes.size > 0 && showMqttInterface) {
    const mqttBrokerNode: ForceGraphNode = {
      id: 'mqtt_broker',
      name: 'MQTT Client',
      node_num: -999,
      node_id: 'mqtt_broker',
      hw_model: 'MQTT Client',
      role: 'BROKER',
      last_seen: new Date().toISOString(),
      color: '#8b5cf6', // Purple color for MQTT Client
      size: 15, // Slightly larger than regular nodes
      isHidden: false,
      isMqttBroker: true,
    };
    forceGraphNodes.push(mqttBrokerNode);
  }
  
  // Filter edges (exclude self-directed links as they'll be replaced with MQTT connections)
  let filteredEdges = edges.filter(edge => {
    const sourceExists = filteredNodeIds.has(edge.source_node_id);
    const targetExists = filteredNodeIds.has(edge.target_node_id);
    return sourceExists && targetExists && edge.source_node_id !== edge.target_node_id;
  });

  // Filter edges by activity if requested
  if (linkActivityFilter !== 'all') {
    filteredEdges = filteredEdges.filter(edge => 
      isWithinTimeRange(edge.last_seen, linkActivityFilter)
    );
  }

  // Filter for bidirectional only if requested
  if (showBidirectionalOnly) {
    filteredEdges = filteredEdges.filter(edge => {
      return filteredEdges.some(reverseEdge => 
        reverseEdge.source_node_id === edge.target_node_id && 
        reverseEdge.target_node_id === edge.source_node_id
      );
    });
  }

  // Create reverse links if forceBidirectional is enabled
  if (forceBidirectional) {
    const existingEdgeMap = new Map<string, Edge>();
    
    // Create a map of existing edges for quick lookup
    filteredEdges.forEach(edge => {
      const key = `${edge.source_node_id}-${edge.target_node_id}`;
      existingEdgeMap.set(key, edge);
    });
    
    const newReverseEdges: Edge[] = [];
    
    // Check each edge and create reverse if it doesn't exist
    filteredEdges.forEach(edge => {
      const reverseKey = `${edge.target_node_id}-${edge.source_node_id}`;
      
      if (!existingEdgeMap.has(reverseKey)) {
        // Create a reverse edge with SNR=0, RSSI=0
        const reverseEdge: Edge = {
          source_node_id: edge.target_node_id,
          target_node_id: edge.source_node_id,
          last_rx_rssi: 0,
          last_rx_snr: 0,
          last_hops: edge.last_hops || 0,
          last_seen: edge.last_seen,
          first_seen: edge.first_seen,
          last_packet_id: 0,
          edge_type: 'virtual_reverse',
          interfaces_names: Array.isArray(edge.interfaces_names) ? [...edge.interfaces_names] : [],
        };
        
        newReverseEdges.push(reverseEdge);
        existingEdgeMap.set(reverseKey, reverseEdge);
      }
    });
    
    // Add the new reverse edges to the filtered edges
    filteredEdges = [...filteredEdges, ...newReverseEdges];
  }

  const forceGraphLinks: ForceGraphLink[] = [];
  const virtualEdgeSet = new Set<string>();
  let hiddenNodeCounter = 0;

  // Transform edges to links
  filteredEdges.forEach((edge) => {
    const sourceNodeId = nodeIdMap.get(edge.source_node_id) || '';
    const targetNodeId = nodeIdMap.get(edge.target_node_id) || '';
    
    // Skip edges where source or target nodes don't exist in filtered node set
    if (!sourceNodeId || !targetNodeId) {
      return; // Skip this edge as one or both nodes were filtered out
    }
    
    const isMqttLink = edge.last_rx_rssi === 0 && edge.last_rx_snr === 0;
    const hops = edge.last_hops || 0;
    const linkDistance = getLinkDistance(edge);

    // Skip MQTT links (SNR = 0 and RSSI = 0) for non-self-directed edges
    if (isMqttLink && edge.source_node_id !== edge.target_node_id) {
      return; // Skip this MQTT edge
    }

    // Skip multi-hop edges if excludeMultiHop is true
    if (excludeMultiHop && hops > 0) {
      return; // Skip this edge (now includes 1-hop as multi-hop)
    }

    if (hops === 0 || !hops) {
      // Direct connection (0 hops = no intermediate nodes)
      forceGraphLinks.push({
        source: sourceNodeId,
        target: targetNodeId,
        rssi: edge.last_rx_rssi,
        snr: edge.last_rx_snr,
        hops: edge.last_hops,
        last_seen: edge.last_seen,
        color: getLinkColor(edge),
        width: getLinkWidth(edge),
        value: Math.abs(edge.last_rx_rssi),
        isMqtt: isMqttLink,
        distance: linkDistance,
      });
    } else {
      // Multi-hop connection (1+ hops = 1+ intermediate nodes) - create both segmented links AND a direct link
      
      // First, create a direct multi-hop link for map view
      if (graph_or_map === 'map') {
        forceGraphLinks.push({
          source: sourceNodeId,
          target: targetNodeId,
          rssi: edge.last_rx_rssi,
          snr: edge.last_rx_snr,
          hops: edge.last_hops, // Keep original hop count
          last_seen: edge.last_seen,
          color: getLinkColor(edge),
          width: getLinkWidth(edge),
          value: Math.abs(edge.last_rx_rssi),
          isMqtt: isMqttLink,
          distance: linkDistance,
          isDirectMultiHop: true, // Mark as direct multi-hop link
          originalHops: edge.last_hops,
        });
      }
      
      // Create intermediate hidden nodes for force graph
      const hiddenNodes: string[] = [];
      const multiHopColor = getLinkActivityColor(edge.last_seen);
      
      // Create exactly 'hops' number of intermediate nodes
      for (let i = 0; i < hops; i++) {
        const hiddenNodeId = `hidden_${hiddenNodeCounter++}`;
        hiddenNodes.push(hiddenNodeId);
        
        forceGraphNodes.push({
          id: hiddenNodeId,
          name: '?',
          node_num: -1,
          node_id: hiddenNodeId,
          color: multiHopColor,
          size: 2,
          isHidden: true,
          last_seen: edge.last_seen,
        });
      }
      
      // Create the chain of links
      const nodeChain = [sourceNodeId, ...hiddenNodes, targetNodeId];
      
      for (let i = 0; i < nodeChain.length - 1; i++) {
        const isLastLink = i === nodeChain.length - 2;
        
        forceGraphLinks.push({
          source: nodeChain[i],
          target: nodeChain[i + 1],
          rssi: edge.last_rx_rssi,
          snr: edge.last_rx_snr,
          hops: 0, // Each segment is a direct link (0 hops)
          last_seen: edge.last_seen,
          color: multiHopColor,
          width: getLinkWidth(edge),
          value: Math.abs(edge.last_rx_rssi),
          isMqtt: isMqttLink,
          distance: linkDistance / (hops + 1), // Divide by number of segments
          isMultiHopSegment: true,
          originalHops: edge.last_hops,
          isLastHop: isLastLink,
        });
      }
    }
  });

  // Create bidirectional links between MQTT Client and nodes with self-directed links
  if (selfDirectedNodes.size > 0 && showMqttInterface) {
    selfDirectedNodes.forEach((lastSeen, nodeId) => {
      const nodeIdString = nodeIdMap.get(nodeId);
      if (nodeIdString) {
        // Use the most recent self-link timestamp that matched the filter
        const selfLastSeen = lastSeen || new Date().toISOString();
        
        // Create bidirectional MQTT links
        // Node -> MQTT Client
        forceGraphLinks.push({
          source: nodeIdString,
          target: 'mqtt_broker',
          rssi: 0, // MQTT links have no RSSI
          snr: 0, // MQTT links have no SNR
          hops: 1,
          last_seen: selfLastSeen,
          color: getLinkActivityColor(selfLastSeen), // Use activity-based color
          width: 1, // MQTT links are thin since they have no SNR
          value: 1,
          isMqtt: true,
          distance: 150, // Medium distance for MQTT connections
          isMqttBrokerLink: true,
        });
        
        // MQTT Client -> Node
        forceGraphLinks.push({
          source: 'mqtt_broker',
          target: nodeIdString,
          rssi: 0, // MQTT links have no RSSI
          snr: 0, // MQTT links have no SNR
          hops: 1,
          last_seen: selfLastSeen,
          color: getLinkActivityColor(selfLastSeen), // Use activity-based color
          width: 1, // MQTT links are thin since they have no SNR
          value: 1,
          isMqtt: true,
          distance: 150, // Medium distance for MQTT connections
          isMqttBrokerLink: true,
        });
      }
    });
  }

  return { 
    nodes: forceGraphNodes, 
    links: forceGraphLinks, 
    virtualEdgeSet 
  };
}
