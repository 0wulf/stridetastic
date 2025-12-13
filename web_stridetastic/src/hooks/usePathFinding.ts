import { useMemo } from 'react';
import { ForceGraphLink } from '@/types';
import { 
  findPathsBetweenNodes, 
  findReachableNodes, 
  findReachableLinks 
} from '@/lib/pathFinding';

export function usePathFinding(
  selectedNodeId: string | null,
  secondSelectedNodeId: string | null,
  links: ForceGraphLink[],
  maxHops: number,
  zeroHopNodes: Set<string> = new Set(),
  maxPaths: number = 100
) {
  // Find paths between two selected nodes
  const pathsBetweenNodes = useMemo(() => {
    if (!selectedNodeId || !secondSelectedNodeId || selectedNodeId === secondSelectedNodeId) {
      return [];
    }
    
    return findPathsBetweenNodes(selectedNodeId, secondSelectedNodeId, links, {
      maxHops,
      maxPaths,
      zeroHopNodes,
    });
  }, [selectedNodeId, secondSelectedNodeId, links, maxHops, maxPaths, zeroHopNodes]);

  // Memoized set of nodes that are part of paths (for fast lookup)
  const pathNodeSet = useMemo(() => {
    const nodeSet = new Set<string>();
    pathsBetweenNodes.forEach(path => {
      path.forEach(nodeId => nodeSet.add(nodeId));
    });
    return nodeSet;
  }, [pathsBetweenNodes]);

  // Find reachable nodes from single selected node
  const reachableNodesFromSelected = useMemo(() => {
    if (!selectedNodeId || secondSelectedNodeId) {
      return new Set<string>();
    }
    
    return findReachableNodes(selectedNodeId, links, maxHops, zeroHopNodes);
  }, [selectedNodeId, secondSelectedNodeId, links, maxHops, zeroHopNodes]);

  // Find reachable links from single selected node
  const reachableLinksFromSelected = useMemo(() => {
    if (!selectedNodeId || secondSelectedNodeId) {
      return new Set<string>();
    }
    
    return findReachableLinks(selectedNodeId, links, maxHops, zeroHopNodes);
  }, [selectedNodeId, secondSelectedNodeId, links, maxHops, zeroHopNodes]);

  return {
    pathsBetweenNodes,
    pathNodeSet,
    reachableNodesFromSelected,
    reachableLinksFromSelected,
  };
}
