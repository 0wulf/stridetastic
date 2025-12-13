import React from 'react';
import { Node } from '@/types';
import { calculateActualHops } from '@/lib/pathFinding';
import { brandGreen, BRAND_ACCENT, BRAND_PRIMARY, BRAND_PRIMARY_DARK, BRAND_PRIMARY_SURFACE } from '@/lib/brandColors';

interface PathAnalysisPanelProps {
  selectedNode: Node;
  secondSelectedNode: Node;
  validPaths: string[][];
  maxHops: number;
  zeroHopNodes?: Set<string>;
  onSwapNodes: () => void;
  onClose: () => void;
}

export function PathAnalysisPanel({
  selectedNode,
  secondSelectedNode,
  validPaths,
  maxHops,
  zeroHopNodes,
  onSwapNodes,
  onClose,
}: PathAnalysisPanelProps) {
  const getPathStats = () => {
    if (validPaths.length === 0) return null;
    
    const hopCounts = validPaths.map(p => calculateActualHops(p, zeroHopNodes));
    return {
      shortest: Math.min(...hopCounts),
      average: Math.round(hopCounts.reduce((a, b) => a + b, 0) / hopCounts.length * 10) / 10,
      longest: Math.max(...hopCounts),
    };
  };

  const stats = getPathStats();

  return (
    <div 
      className="rounded-lg border shadow-sm p-4" 
      style={{ backgroundColor: BRAND_PRIMARY_SURFACE, borderColor: BRAND_ACCENT }}
    >
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold" style={{ color: BRAND_PRIMARY_DARK }}>
            Path Analysis: {selectedNode.short_name && selectedNode.long_name 
              ? `${selectedNode.short_name} (${selectedNode.long_name})`
              : selectedNode.short_name || selectedNode.long_name || selectedNode.node_id.slice(-4)} → {secondSelectedNode.short_name && secondSelectedNode.long_name 
              ? `${secondSelectedNode.short_name} (${secondSelectedNode.long_name})`
              : secondSelectedNode.short_name || secondSelectedNode.long_name || secondSelectedNode.node_id.slice(-4)}
          </h3>
          <div className="flex items-center justify-between">
            <p className="text-sm" style={{ color: BRAND_PRIMARY_DARK }}>
              {validPaths.length > 0 
                ? `Found ${validPaths.length} valid path${validPaths.length > 1 ? 's' : ''} between selected nodes`
                : 'No valid paths found between selected nodes'
              }
            </p>
            
            {/* Swap nodes button */}
            <button
              onClick={onSwapNodes}
              className="flex items-center px-3 py-1 bg-white border border-blue-300 rounded-lg hover:bg-blue-50 transition-colors text-sm"
              style={{ color: BRAND_PRIMARY_DARK }}
              title="Swap source and target nodes"
            >
              <svg className="h-4 w-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m0-4l4-4" />
              </svg>
              Swap
            </button>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-2 rounded-full transition-colors hover:bg-blue-100"
          style={{ backgroundColor: 'transparent', color: BRAND_PRIMARY_DARK }}
          title="Close"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      
      {/* Path statistics */}
      {stats && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="font-medium" style={{ color: BRAND_PRIMARY_DARK }}>Available Paths:</h4>
            <div className="text-sm" style={{ color: BRAND_PRIMARY_DARK }}>
              Max {maxHops} hops
            </div>
          </div>
          
          <div className="grid grid-cols-3 gap-4 pt-3 border-t" style={{ borderColor: brandGreen[200] }}>
            <div className="text-center">
              <div className="text-lg font-semibold" style={{ color: BRAND_PRIMARY_DARK }}>
                {stats.shortest}
              </div>
              <div className="text-xs" style={{ color: '#6b7280' }}>Shortest Path Hops</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-semibold" style={{ color: BRAND_PRIMARY_DARK }}>
                {stats.average}
              </div>
              <div className="text-xs" style={{ color: '#6b7280' }}>Average Path Hops</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-semibold" style={{ color: BRAND_PRIMARY_DARK }}>
                {stats.longest}
              </div>
              <div className="text-xs" style={{ color: '#6b7280' }}>Longest Path Hops</div>
            </div>
          </div>
        </div>
      )}
      
      {/* Detailed path list */}
      {validPaths.length > 0 && (
        <div className="mt-4">
          <h4 className="text-sm font-semibold mb-3" style={{ color: '#374151' }}>
            Available Paths ({validPaths.length})
          </h4>
          <div className="max-h-64 overflow-y-auto">
            {validPaths.map((path, index) => (
              <div 
                key={index} 
                className="mb-2 p-2 border rounded-md bg-gray-50"
                style={{ borderColor: '#e5e7eb' }}
              >
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs font-medium" style={{ color: '#6b7280' }}>
                    Path {index + 1}
                  </span>
                  <span className="text-xs px-2 py-1 rounded-full bg-blue-100" style={{ color: BRAND_PRIMARY_DARK }}>
                    {calculateActualHops(path, zeroHopNodes)} hops
                  </span>
                </div>
                <div className="text-sm" style={{ color: '#374151' }}>
                  {path.map((nodeId, nodeIndex) => (
                    <span key={nodeId}>
                      <span className="font-medium">{nodeId}</span>
                      {nodeIndex < path.length - 1 && (
                        <span className="mx-1" style={{ color: '#6b7280' }}>→</span>
                      )}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
