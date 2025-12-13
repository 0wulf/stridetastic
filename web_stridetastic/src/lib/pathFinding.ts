import { ForceGraphLink } from '@/types';

export interface PathFindingOptions {
  maxHops: number;
  maxPaths: number;
  zeroHopNodes?: Set<string>;
}

function isZeroHopNode(nodeId: string, zeroHopNodes?: Set<string>): boolean {
  return Boolean(zeroHopNodes && zeroHopNodes.has(nodeId));
}

function calculateHopsInternal(path: string[], zeroHopNodes?: Set<string>): number {
  if (path.length <= 1) return 0;

  let hops = 0;
  for (let i = 1; i < path.length - 1; i++) {
    const nodeId = path[i];
    if (!isZeroHopNode(nodeId, zeroHopNodes)) {
      hops += 1;
    }
  }
  return hops;
}

// Build adjacency list from graph links - respecting directionality
export function buildAdjacencyList(links: ForceGraphLink[]): Map<string, Set<string>> {
  const adjacencyList = new Map<string, Set<string>>();
  
  links.forEach(link => {
    const sourceId = typeof link.source === 'string' ? link.source : (link.source as any).id;
    const targetId = typeof link.target === 'string' ? link.target : (link.target as any).id;
    
    if (!adjacencyList.has(sourceId)) adjacencyList.set(sourceId, new Set());
    if (!adjacencyList.has(targetId)) adjacencyList.set(targetId, new Set());
    
    // Only add the actual direction of the link (source -> target)
    adjacencyList.get(sourceId)!.add(targetId);
    
    // Only add reverse direction if a reverse link actually exists
    const hasReverseLink = links.some(reverseLink => {
      const reverseLinkSourceId = typeof reverseLink.source === 'string' ? reverseLink.source : (reverseLink.source as any).id;
      const reverseLinkTargetId = typeof reverseLink.target === 'string' ? reverseLink.target : (reverseLink.target as any).id;
      return reverseLinkSourceId === targetId && reverseLinkTargetId === sourceId;
    });
    
    if (hasReverseLink) {
      adjacencyList.get(targetId)!.add(sourceId);
    }
  });
  
  return adjacencyList;
}

// Find paths between two nodes using BFS
export function findPathsBetweenNodes(
  sourceId: string,
  targetId: string,
  links: ForceGraphLink[],
  options: PathFindingOptions
): string[][] {
  if (!sourceId || !targetId || sourceId === targetId) {
    return [];
  }

  const adjacencyList = buildAdjacencyList(links);
  const paths: string[][] = [];
  const queue: { nodeId: string, path: string[] }[] = [{ 
    nodeId: sourceId, 
    path: [sourceId]
  }];
  const visited = new Set<string>();
  
  while (queue.length > 0 && paths.length < options.maxPaths) {
    const { nodeId, path } = queue.shift()!;
    
    // Check if we've reached the destination
    if (nodeId === targetId && path.length > 1) {
      paths.push([...path]);
      continue;
    }
    
    // Handle maxHops constraint using customizable hop calculation
    const currentHops = calculateHopsInternal(path, options.zeroHopNodes);
    if (currentHops >= options.maxHops) continue;
    
    const pathKey = path.join('-');
    if (visited.has(pathKey)) continue;
    visited.add(pathKey);
    
    const neighbors = adjacencyList.get(nodeId);
    if (neighbors) {
      for (const neighbor of neighbors) {
        if (!path.includes(neighbor)) { // Prevent cycles
          queue.push({ 
            nodeId: neighbor, 
            path: [...path, neighbor]
          });
        }
      }
    }
  }
  
  // Validate paths - ensure each path has valid directional links
  return paths.filter(path => {
    for (let i = 0; i < path.length - 1; i++) {
      const sourceNodeId = path[i];
      const targetNodeId = path[i + 1];
      
      // Check for EXACT directional match (source -> target)
      const linkExists = links.some(link => {
        const linkSourceId = typeof link.source === 'string' ? link.source : (link.source as any).id;
        const linkTargetId = typeof link.target === 'string' ? link.target : (link.target as any).id;
        
        // Only allow the exact direction: source -> target (no bidirectional fallback)
        return linkSourceId === sourceNodeId && linkTargetId === targetNodeId;
      });
      
      if (!linkExists) return false;
    }
    return true;
  });
}

// Find all reachable nodes from a source node within hop limit
export function findReachableNodes(
  sourceId: string,
  links: ForceGraphLink[],
  maxHops: number,
  zeroHopNodes?: Set<string>
): Set<string> {
  if (!sourceId) return new Set();

  const adjacencyList = buildAdjacencyList(links);
  const reachableNodes = new Set<string>();
  
  const queue: { nodeId: string, path: string[] }[] = [{ 
    nodeId: sourceId, 
    path: [sourceId]
  }];
  const visited = new Set<string>();
  
  while (queue.length > 0) {
    const { nodeId, path } = queue.shift()!;
    
  const currentHops = calculateHopsInternal(path, zeroHopNodes);
    if (currentHops > maxHops) continue;
    
    const pathKey = path.join('-');
    if (visited.has(pathKey)) continue;
    visited.add(pathKey);
    
    // Add all nodes in this path to reachable set
    path.forEach(pathNodeId => reachableNodes.add(pathNodeId));
    
    const neighbors = adjacencyList.get(nodeId);
    if (neighbors) {
      for (const neighbor of neighbors) {
        if (!path.includes(neighbor)) {
          // Validate link exists in the correct direction
          const linkExists = links.some(link => {
            const linkSourceId = typeof link.source === 'string' ? link.source : (link.source as any).id;
            const linkTargetId = typeof link.target === 'string' ? link.target : (link.target as any).id;
            
            // Only allow exact directional match: nodeId -> neighbor
            return linkSourceId === nodeId && linkTargetId === neighbor;
          });
          
          if (linkExists) {
            queue.push({
              nodeId: neighbor,
              path: [...path, neighbor],
            });
          }
        }
      }
    }
  }
  
  return reachableNodes;
}

// Find all reachable links from a source node within hop limit
export function findReachableLinks(
  sourceId: string,
  links: ForceGraphLink[],
  maxHops: number,
  zeroHopNodes?: Set<string>
): Set<string> {
  if (!sourceId) return new Set();

  const adjacencyList = buildAdjacencyList(links);
  const reachableLinks = new Set<string>();
  
  const queue: { nodeId: string, path: string[] }[] = [{ 
    nodeId: sourceId, 
    path: [sourceId]
  }];
  const visited = new Set<string>();
  
  while (queue.length > 0) {
    const { nodeId, path } = queue.shift()!;
    
    const currentHops = calculateHopsInternal(path, zeroHopNodes);
    if (currentHops > maxHops) continue;
    
    const pathKey = path.join('-');
    if (visited.has(pathKey)) continue;
    visited.add(pathKey);
    
    // Add all edges in this path to reachable links set
    for (let i = 0; i < path.length - 1; i++) {
      const sourceNodeId = path[i];
      const targetNodeId = path[i + 1];
      
      // Validate that the link actually exists in the correct direction
      const linkExists = links.some(link => {
        const linkSourceId = typeof link.source === 'string' ? link.source : (link.source as any).id;
        const linkTargetId = typeof link.target === 'string' ? link.target : (link.target as any).id;
        
        // Only check exact directional match: sourceNodeId -> targetNodeId
        return linkSourceId === sourceNodeId && linkTargetId === targetNodeId;
      });
      
      if (linkExists) {
        const key = `${sourceNodeId}-${targetNodeId}`;
        reachableLinks.add(key);
        // Note: Not adding reverse key since we're checking directionality
      }
    }
    
    const neighbors = adjacencyList.get(nodeId);
    if (neighbors) {
      for (const neighbor of neighbors) {
        if (!path.includes(neighbor)) {
          // Validate link exists in the correct direction  
          const linkExists = links.some(link => {
            const linkSourceId = typeof link.source === 'string' ? link.source : (link.source as any).id;
            const linkTargetId = typeof link.target === 'string' ? link.target : (link.target as any).id;
            
            // Only allow exact directional match: nodeId -> neighbor
            return linkSourceId === nodeId && linkTargetId === neighbor;
          });
          
          if (linkExists) {
            queue.push({
              nodeId: neighbor,
              path: [...path, neighbor],
            });
          }
        }
      }
    }
  }
  
  return reachableLinks;
}

// Calculate actual hop count for a path (number of intermediate nodes)
export function calculateActualHops(path: string[], zeroHopNodes?: Set<string>): number {
  return calculateHopsInternal(path, zeroHopNodes);
}
