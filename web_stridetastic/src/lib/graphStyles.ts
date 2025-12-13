import { ForceGraphNode, ForceGraphLink } from '@/types';
import { BRAND_PRIMARY, BRAND_PRIMARY_DARK } from '@/lib/brandColors';

export interface GraphStyleOptions {
  selectedNodeId: string | null;
  secondSelectedNodeId: string | null;
  reachableNodes: Set<string>;
  reachableLinks: Set<string>;
  pathNodes: Set<string>;
  virtualEdgeSet: Set<string>;
  rawNodes: any[];
  rawEdges: any[];
}

// Check if two nodes have bidirectional connection
export function isBidirectionalConnection(
  sourceId: string, 
  targetId: string, 
  links: ForceGraphLink[]
): boolean {
  const forwardLink = links.some(link => {
    const linkSourceId = typeof link.source === 'string' ? link.source : (link.source as any).id;
    const linkTargetId = typeof link.target === 'string' ? link.target : (link.target as any).id;
    return linkSourceId === sourceId && linkTargetId === targetId;
  });
  
  const reverseLink = links.some(link => {
    const linkSourceId = typeof link.source === 'string' ? link.source : (link.source as any).id;
    const linkTargetId = typeof link.target === 'string' ? link.target : (link.target as any).id;
    return linkSourceId === targetId && linkTargetId === sourceId;
  });
  
  return forwardLink && reverseLink;
}

// Get link curvature for bidirectional connections
export function getLinkCurvature(link: ForceGraphLink, links: ForceGraphLink[]): number {
  const sourceId = typeof link.source === 'string' ? link.source : (link.source as any).id;
  const targetId = typeof link.target === 'string' ? link.target : (link.target as any).id;
  
  if (isBidirectionalConnection(sourceId, targetId, links)) {
    return 0.1; // Add curvature to separate bidirectional links visually
  }
  
  return 0; // No curvature for unidirectional links
}

// Check if a link is part of any path between selected nodes - respecting directionality
export function isLinkInPath(
  link: ForceGraphLink, 
  paths: string[][]
): boolean {
  const linkSourceId = typeof link.source === 'string' ? link.source : (link.source as any).id;
  const linkTargetId = typeof link.target === 'string' ? link.target : (link.target as any).id;
  
  return paths.some(path => {
    for (let i = 0; i < path.length - 1; i++) {
      const pathSourceId = path[i];
      const pathTargetId = path[i + 1];
      
      // Only check exact directional match (no bidirectional fallback)
      if (linkSourceId === pathSourceId && linkTargetId === pathTargetId) {
        return true;
      }
    }
    return false;
  });
}

// Get node color with highlighting
export function getNodeColor(node: ForceGraphNode, options: GraphStyleOptions): string {
  const { selectedNodeId, secondSelectedNodeId, reachableNodes, pathNodes } = options;
  
  // Two-node selection mode
  if (selectedNodeId && secondSelectedNodeId) {
    if (node.id === selectedNodeId) {
      return BRAND_PRIMARY_DARK; // Bold Meshtastic green for first selected
    } else if (node.id === secondSelectedNodeId) {
      return '#10b981'; // Bright green for second selected
    }
    
    if (pathNodes.has(node.id)) {
      return node.color || BRAND_PRIMARY; // Keep original color or fall back to brand green for path nodes
    } else {
      // MQTT Client gets dimmed like other non-path nodes
      if (node.isMqttBroker) {
        return '#d1d5db'; // Dimmed version of MQTT Client
      }
      return node.isHidden ? '#e5e7eb' : '#d1d5db'; // Dim non-path nodes
    }
  }
  
  // Single node selection mode
  if (selectedNodeId && !secondSelectedNodeId) {
    if (node.id === selectedNodeId) {
      return BRAND_PRIMARY; // Brand green for selected nodes
    }
    
    if (reachableNodes.has(node.id)) {
      return node.color || BRAND_PRIMARY; // Keep original or fall back to brand green for reachable nodes
    } else {
      // MQTT Client gets dimmed like other non-reachable nodes
      if (node.isMqttBroker) {
        return '#d1d5db'; // Dimmed version of MQTT Client
      }
      return node.isHidden ? '#e5e7eb' : '#d1d5db'; // Dim non-reachable nodes
    }
  }
  
  // No selection - MQTT Client has its distinctive color
  if (node.isMqttBroker) {
    return '#8b5cf6'; // Purple color for MQTT Client
  }
  
  // No selection - return original color
  return node.color || BRAND_PRIMARY;
}

// Get link color with highlighting
export function getLinkColor(
  link: ForceGraphLink, 
  options: GraphStyleOptions,
  paths: string[][] = []
): string {
  const { selectedNodeId, secondSelectedNodeId, reachableLinks } = options;
  
  // Two-node path highlighting mode
  if (selectedNodeId && secondSelectedNodeId) {
    if (isLinkInPath(link, paths)) {
      return link.color || '#999999'; // Highlight path links
    } else {
      // Dim all non-path links (including MQTT) equally
      const originalColor = link.color || '#999999';
      return originalColor.startsWith('#') ? originalColor + '40' : 'rgba(153, 153, 153, 0.25)';
    }
  }
  
  // Single node highlighting mode
  if (selectedNodeId && !secondSelectedNodeId) {
    const linkSourceId = typeof link.source === 'string' ? link.source : (link.source as any).id;
    const linkTargetId = typeof link.target === 'string' ? link.target : (link.target as any).id;
    
    // Only check the actual direction of the link
    const key = `${linkSourceId}-${linkTargetId}`;
    
    if (reachableLinks.has(key)) {
      return link.color || '#999999'; // Highlight reachable links
    } else {
      // Dim all non-reachable links (including MQTT) equally
      const originalColor = link.color || '#999999';
      return originalColor.startsWith('#') ? originalColor + '40' : 'rgba(153, 153, 153, 0.25)';
    }
  }
  
  // No selection - return original color (including MQTT links)
  return link.color || '#999999';
}

// Get link width with highlighting
export function getLinkWidth(
  link: ForceGraphLink, 
  options: GraphStyleOptions,
  paths: string[][] = []
): number {
  const { selectedNodeId, secondSelectedNodeId, reachableLinks } = options;
  
  // Hidden links should always be thin
  if (link.isMultiHopSegment && !link.isLastHop) {
    return 1;
  }
  
  // Two-node path highlighting mode
  if (selectedNodeId && secondSelectedNodeId) {
    if (isLinkInPath(link, paths)) {
      return (link.width || 2) * 1.5; // Highlight path links
    } else {
      // MQTT Client links get dimmed like other non-path links
      if (link.isMqttBrokerLink) {
        return 1; // Thin dimmed width for MQTT Client links
      }
      return (link.width || 2) * 0.5; // Dim other links
    }
  }
  
  // Single node highlighting mode
  if (selectedNodeId && !secondSelectedNodeId) {
    const linkSourceId = typeof link.source === 'string' ? link.source : (link.source as any).id;
    const linkTargetId = typeof link.target === 'string' ? link.target : (link.target as any).id;
    
    // Only check the actual direction of the link
    const key = `${linkSourceId}-${linkTargetId}`;
    
    if (reachableLinks.has(key)) {
      return (link.width || 2) * 1.5; // Highlight reachable links
    } else {
      // MQTT Client links get dimmed like other non-reachable links
      if (link.isMqttBrokerLink) {
        return 1; // Thin dimmed width for MQTT Client links
      }
      return (link.width || 2) * 0.5; // Dim non-reachable links
    }
  }
  
  // No selection - return original width
  return link.width || 2;
}

// Get link label with virtual edge information
export function getLinkLabel(
  link: ForceGraphLink,
  options: GraphStyleOptions
): string {
  const { virtualEdgeSet, rawNodes, rawEdges } = options;
  let baseLabel = '';
  
  const sourceId = typeof link.source === 'string' ? link.source : (link.source as any).id;
  const targetId = typeof link.target === 'string' ? link.target : (link.target as any).id;
  
  // Find corresponding nodes in raw data to check virtual status
  const sourceNode = rawNodes.find(n => n.node_id === sourceId);
  const targetNode = rawNodes.find(n => n.node_id === targetId);
  
  if (sourceNode && targetNode) {
    const sourceDbId = sourceNode.id;
    const targetDbId = targetNode.id;
    
    const virtualKey = `${sourceDbId}-${targetDbId}`;
    const isVirtualLink = virtualEdgeSet.has(virtualKey);
    
    // Find original edge for type information
    const originalEdge = rawEdges.find(edge => 
      (edge.source_node_id === sourceDbId && edge.target_node_id === targetDbId) ||
      (edge.source_node_id === targetDbId && edge.target_node_id === sourceDbId)
    );
    
    // Generate appropriate label
    if (link.isMqttBrokerLink) {
      baseLabel = `MQTT Client Connection`;
    } else if (link.isMqtt) {
      baseLabel = `Aparent Link`;
    } else if (originalEdge?.edge_type === 'LOGICAL') {
      baseLabel = `Logical Link - RSSI: ${link.rssi} dBm, SNR: ${link.snr} dB`;
    } else if (link.isMultiHopSegment) {
      if (link.isLastHop) {
        baseLabel = `Final hop of ${link.originalHops}-hop path - RSSI: ${link.rssi} dBm, SNR: ${link.snr} dB`;
      } else {
        baseLabel = `Intermediate hop ${(link.originalHops && link.originalHops > 2) ? `(of ${link.originalHops})` : ''} - Signal data at destination`;
      }
    } else if (link.originalHops && link.originalHops > 1) {
      baseLabel = `${link.originalHops}-hop path - RSSI: ${link.rssi} dBm, SNR: ${link.snr} dB`;
    } else {
      baseLabel = `Direct link - RSSI: ${link.rssi} dBm, SNR: ${link.snr} dB`;
    }
    
    if (isVirtualLink) {
      baseLabel = `[ASSUMED] ${baseLabel} (estimated based on reverse signal)`;
    }
  }
  
  return baseLabel;
}

// Get link line dash pattern for virtual/multi-hop links
export function getLinkLineDash(
  link: ForceGraphLink,
  virtualEdgeSet: Set<string>,
  graphNodes: ForceGraphNode[]
): number[] | null {
  // MQTT Client links are always dotted
  if (link.isMqttBrokerLink) {
    return [2, 3]; // Short dots for MQTT Client links
  }
  
  const sourceId = typeof link.source === 'string' ? link.source : (link.source as any).id;
  const targetId = typeof link.target === 'string' ? link.target : (link.target as any).id;
  
  const sourceNode = graphNodes.find(n => n.id === sourceId);
  const targetNode = graphNodes.find(n => n.id === targetId);
  
  if (sourceNode && targetNode) {
    const virtualKey = `${sourceNode?.node_id}-${targetNode?.node_id}`;
    const reverseVirtualKey = `${targetNode?.node_id}-${sourceNode?.node_id}`;
    
    if (virtualEdgeSet.has(virtualKey) || virtualEdgeSet.has(reverseVirtualKey)) {
      return [8, 4]; // Longer dashes for virtual/assumed links
    }
  }
  
  if (link.isMultiHopSegment) {
    return [5, 5]; // Regular dashes for multi-hop segments
  }
  
  return null; // Solid line for normal physical links
}
