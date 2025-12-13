'use client';

import React, { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { ForceGraphNode, ForceGraphLink } from '@/types';
import { useNetworkData } from '@/hooks/useNetworkData';
import { ActivityTimeRange, getActivityTimeRanges } from '@/lib/activityFilters';
import { useMapFocus } from '@/contexts/MapFocusContext';
import '@/styles/network-map.css';
import '@/styles/network-map-enhanced.css';
import {
  Satellite,
  Map as MapIcon,
  Settings,
  Minimize2,
  Target
} from 'lucide-react';
import RefreshButton from './RefreshButton';
import { useAutoRefresh } from '@/hooks/useAutoRefresh';
import { formatLocationSourceLabel } from '@/lib/position';
import { BRAND_PRIMARY } from '@/lib/brandColors';

// Dynamic imports for Leaflet to avoid SSR issues
const MapContainer = dynamic(
  () => import('react-leaflet').then((mod) => {
    console.log('MapContainer loaded successfully');
    return mod.MapContainer;
  }),
  { 
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-full bg-gray-100 rounded-lg">
        <div className="text-gray-500">Loading map components...</div>
      </div>
    )
  }
);
const TileLayer = dynamic(
  () => import('react-leaflet').then((mod) => mod.TileLayer),
  { ssr: false }
);
const Marker = dynamic(
  () => import('react-leaflet').then((mod) => mod.Marker),
  { ssr: false }
);
const Popup = dynamic(
  () => import('react-leaflet').then((mod) => mod.Popup),
  { ssr: false }
);
const Polyline = dynamic(
  () => import('react-leaflet').then((mod) => mod.Polyline),
  { ssr: false }
);
const Circle = dynamic(
  () => import('react-leaflet').then((mod) => mod.Circle),
  { ssr: false }
);

// Custom Link component with hover - enhanced with sophisticated styling
const LinkWithHover = React.memo(({ link, coordinates, color, opacity, isHovered, onHover, onLeave }: {
  link: ForceGraphLink;
  coordinates: [number, number][];
  color: string;
  opacity: number;
  isHovered?: boolean;
  onHover: (link: ForceGraphLink, event: any) => void;
  onLeave: () => void;
}) => {
  if (coordinates.length === 0) return null;

  // Determine line styling based on link characteristics
  let weight = 3; // Fixed base thickness for all links
  let dashArray: string | undefined = undefined;
  
  // MQTT links - thin solid lines (matching topology graph)
  if (link.isMqtt || link.isMqttBrokerLink) {
    weight = 2; // Slightly thinner for MQTT
    dashArray = undefined; // Solid line
  }
  // Direct multi-hop - use base width with dashed pattern
  else if (link.isDirectMultiHop) {
    dashArray = '10, 5'; // Long dashes to distinguish from regular links
  }
  // Multi-hop segments - thin dotted lines
  else if (link.isMultiHopSegment && !link.isLastHop) {
    weight = 2; // Thinner for segments
    dashArray = '3, 3'; // Short dashes for segments
  }
  // Regular multi-hop - medium dotted lines
  else if (link.hops > 0) {
    dashArray = '5, 5'; // Dotted line for multi-hop
  }
  // Direct connections use fixed thickness, signal strength shown via opacity

  // Enhance weight when hovered
  if (isHovered) {
    weight += 2; // Increase thickness when hovered
  }

  return (
    <Polyline
      positions={coordinates}
      color={color}
      opacity={opacity}
      weight={weight}
      dashArray={dashArray}
      eventHandlers={{
        mouseover: (e) => onHover(link, e),
        mouseout: onLeave,
      }}
    />
  );
});

LinkWithHover.displayName = 'LinkWithHover';

// Function to create arrow icons - REMOVED

interface NetworkMapProps {
  className?: string;
}

interface PositionedNode extends ForceGraphNode {
  lat: number;
  lng: number;
  pinned?: boolean;
  isManuallyPositioned?: boolean;
}

interface MapSettings {
  tileLayer: 'street' | 'satellite' | 'hybrid' | 'minimal';
  showNodeLabels: boolean;
  showSignalStrength: boolean;
  showOnlyBidirectional: boolean;
  showPositionAccuracy: boolean;
  maxHops: number;
  activityFilter: ActivityTimeRange;
}

const TILE_LAYERS = {
  street: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  },
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
  },
  hybrid: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  },
  minimal: {
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
  }
};

// Default center (you can adjust this to your area of interest)
const DEFAULT_CENTER: [number, number] = [40.7128, -74.0060]; // New York City
const DEFAULT_ZOOM = 10;

// Convert Meshtastic precision bits to radius in meters
// Based on https://meshtastic.org/docs/configuration/radio/channels/#position-precision
function precisionBitsToRadius(precisionBits?: number): number {
  if (!precisionBits || precisionBits <= 0) return 0;
  
  // Meshtastic precision table (bits -> radius in meters)
  const precisionTable: { [bits: number]: number } = {
    10: 23300,  // 23.3 km
    11: 11700,  // 11.7 km
    12: 5800,   // 5.8 km
    13: 2900,   // 2.9 km
    14: 1500,   // 1.5 km (4787 feet)
    15: 729,    // 729 m
    16: 364,    // 364 m
    17: 182,    // 182 m
    18: 91,     // 91 m
    19: 45,     // 45 m
    20: 23,     // ~23 m (estimated)
    21: 11,     // ~11 m (estimated)
    22: 6,      // ~6 m (estimated)
    23: 3,      // ~3 m (estimated)
    24: 1.5,    // ~1.5 m (estimated)
    25: 0.7,    // ~0.7 m (estimated)
    26: 0.4,    // ~0.4 m (estimated)
    27: 0.2,    // ~0.2 m (estimated)
    28: 0.1,    // ~0.1 m (estimated)
    29: 0.05,   // ~0.05 m (estimated)
    30: 0.025,  // ~0.025 m (estimated)
    31: 0.01,   // ~0.01 m (estimated)
    32: 0.005,  // ~0.005 m (estimated - full precision)
  };
  
  // Return exact value if in table
  if (precisionTable[precisionBits]) {
    return precisionTable[precisionBits];
  }
  
  // For values not in table, calculate approximation
  // GPS precision roughly halves with each additional bit
  if (precisionBits < 10) {
    // Less precise than 10 bits, extrapolate upward
    return 23300 * Math.pow(2, 10 - precisionBits);
  } else if (precisionBits > 32) {
    // More precise than 32 bits (unlikely), cap at highest precision
    return 0.005;
  } else {
    // Between known values, interpolate
    const lowerBits = Math.floor(precisionBits);
    const upperBits = Math.ceil(precisionBits);
    
    if (lowerBits === upperBits) {
      return precisionTable[lowerBits] || 0;
    }
    
    const lowerRadius = precisionTable[lowerBits] || 0;
    const upperRadius = precisionTable[upperBits] || 0;
    const fraction = precisionBits - lowerBits;
    
    return lowerRadius + (upperRadius - lowerRadius) * fraction;
  }
}

export default function NetworkMap({ className = '' }: NetworkMapProps) {
  const mapRef = useRef<any>(null);
  const { focusedNodeId, shouldFocusOnLoad, setFocusedNodeId, setShouldFocusOnLoad } = useMapFocus();

  // Hide settings when clicking the map background
  const [settings, setSettings] = useState<MapSettings>({
    tileLayer: 'minimal',
    showNodeLabels: true,
    showSignalStrength: true,
    showOnlyBidirectional: false,
    showPositionAccuracy: true,
    maxHops: 0, // Default to direct links only; increase to show multi-hop paths
    activityFilter: 'all',
  });
  
  // Network data
  const {
    graphData,
    isLoading,
    error,
    refetch,
    lastUpdate,
  } = useNetworkData(
    'map',
    settings.showOnlyBidirectional, 
    true, 
    false, 
    settings.maxHops === 0, // exclude multi-hop when user selects 0 (direct-only)
    settings.activityFilter, 
    settings.activityFilter
  );

  // Node positions state - removed most positioning functionality
  const [selectedNode, setSelectedNode] = useState<PositionedNode | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [hoveredNode, setHoveredNode] = useState<PositionedNode | null>(null);
  const [nodeHoverPosition, setNodeHoverPosition] = useState<{ x: number; y: number } | null>(null);
  const [hoveredLink, setHoveredLink] = useState<ForceGraphLink | null>(null);
  const [linkHoverPosition, setLinkHoverPosition] = useState<{ x: number; y: number } | null>(null);

  const handleRefresh = useCallback(async () => {
    if (isLoading) {
      return;
    }
    await refetch();
  }, [isLoading, refetch]);

  useAutoRefresh(handleRefresh, { intervalMs: 60_000 });

  // Process nodes with positions and spread overlapping nodes
  const positionedNodes = useMemo(() => {
    const baseNodes = graphData.nodes
      .filter(node => {
        // Only include nodes that have GPS coordinates and are not MQTT broker nodes
        return node.latitude && node.longitude && !node.isMqttBroker && node.id !== 'mqtt_broker';
      })
      .map(node => {
        // Use GPS coordinates directly
        return {
          ...node,
          lat: node.latitude!,
          lng: node.longitude!,
          pinned: false,
          isManuallyPositioned: false
        } as PositionedNode;
      });

    // Group nodes by their exact coordinates to find overlapping ones
    const coordinateGroups = new Map<string, PositionedNode[]>();
    
    baseNodes.forEach(node => {
      const coordKey = `${node.lat.toFixed(6)},${node.lng.toFixed(6)}`;
      if (!coordinateGroups.has(coordKey)) {
        coordinateGroups.set(coordKey, []);
      }
      coordinateGroups.get(coordKey)!.push(node);
    });

    // Spread out overlapping nodes
    const spreadNodes: PositionedNode[] = [];
    
    coordinateGroups.forEach((nodesAtSameLocation, coordKey) => {
      if (nodesAtSameLocation.length === 1) {
        // Single node, no spreading needed
        spreadNodes.push(nodesAtSameLocation[0]);
      } else {
        // Multiple nodes at same location - spread them in a circle
        const centerLat = nodesAtSameLocation[0].lat;
        const centerLng = nodesAtSameLocation[0].lng;
        
        // Calculate spreading radius based on number of nodes
        // Base radius in meters, scaled for better visibility
        const baseRadiusMeters = Math.max(15, Math.min(nodesAtSameLocation.length * 8, 100)); // 15-100m radius
        
        // Convert meters to degrees (approximate conversion)
        // 1 degree latitude ≈ 111,320 meters
        // 1 degree longitude ≈ 111,320 * cos(latitude) meters
        const latDegreeOffset = baseRadiusMeters / 111320;
        const lngDegreeOffset = baseRadiusMeters / (111320 * Math.cos(centerLat * Math.PI / 180));
        
        nodesAtSameLocation.forEach((node, index) => {
          if (index === 0) {
            // Keep first node at original position
            spreadNodes.push(node);
          } else {
            // Spread other nodes in a circle
            const angle = (2 * Math.PI * index) / nodesAtSameLocation.length;
            const offsetLat = Math.sin(angle) * latDegreeOffset;
            const offsetLng = Math.cos(angle) * lngDegreeOffset;
            
            spreadNodes.push({
              ...node,
              lat: centerLat + offsetLat,
              lng: centerLng + offsetLng,
              isManuallyPositioned: true, // Mark as spread for visual indication
            });
          }
        });
      }
    });

    return spreadNodes;
  }, [graphData.nodes]);

  // Calculate center from positioned nodes - focus on random node each time
  const mapCenter = useMemo(() => {
    if (positionedNodes.length === 0) return DEFAULT_CENTER;
    
    // Pick a random node to center on
    const randomIndex = Math.floor(Math.random() * positionedNodes.length);
    const randomNode = positionedNodes[randomIndex];
    
    return [randomNode.lat, randomNode.lng] as [number, number];
  }, [positionedNodes]);

  // Find MQTT connected nodes for ring indicators - optimized
  const mqttConnectedNodes = useMemo(() => {
    const mqttNodes = new Set<string>();
    
    // Look for the MQTT broker node first
    const mqttBrokerNode = graphData.nodes.find(node => node.id === 'mqtt_broker' || node.isMqttBroker);
    
    if (mqttBrokerNode) {
      // Find all nodes connected to the MQTT broker
      for (const link of graphData.links) {
        if (link.source === 'mqtt_broker' || link.target === 'mqtt_broker') {
          const connectedNodeId = link.source === 'mqtt_broker' ? link.target : link.source;
          mqttNodes.add(connectedNodeId);
        }
      }
    } else {
      // Fallback: Look for nodes with self-links
      for (const link of graphData.links) {
        if (link.source === link.target) {
          mqttNodes.add(link.source);
        }
      }
    }

    return mqttNodes;
  }, [graphData.links, graphData.nodes]);

  // Filter links based on settings - optimized with early returns
  const visibleLinks = useMemo(() => {
    let baseLinks = graphData.links;
    
    // Filter for bidirectional if needed
    if (settings.showOnlyBidirectional) {
      const linkMap = new Map<string, ForceGraphLink>();
      baseLinks.forEach(link => {
        linkMap.set(`${link.source}-${link.target}`, link);
      });
      
      baseLinks = baseLinks.filter(link => 
        linkMap.has(`${link.target}-${link.source}`)
      );
    }

    // Filter out unwanted links in one pass
    const filteredLinks = baseLinks.filter(link => 
      link.source !== 'mqtt_broker' && 
      link.target !== 'mqtt_broker' &&
      !link.source.startsWith('hidden_') &&
      !link.target.startsWith('hidden_') &&
      !(link as any).isMultiHopSegment &&
      !(link.rssi === 0 && link.snr === 0 && (!link.hops || link.hops < 1)) &&
      // Hop filtering: 0 = direct only (hops === 0); n>0 = include links with hops <= n
      ((settings.maxHops === 0 && (link.hops ?? 0) === 0) || (settings.maxHops > 0 && (link.hops ?? 0) <= settings.maxHops))
    );
    
    return filteredLinks;
  }, [graphData.links, settings.showOnlyBidirectional, settings.maxHops]);

  // Node click handler
  const handleNodeClick = useCallback((node: PositionedNode) => {
    setSelectedNode(selectedNode?.id === node.id ? null : node);
  }, [selectedNode]);

  // Get link coordinates for rendering - optimized with node map
  const nodePositionMap = useMemo(() => {
    const map = new Map<string, { lat: number; lng: number }>();
    positionedNodes.forEach(node => {
      map.set(node.id, { lat: node.lat, lng: node.lng });
    });
    return map;
  }, [positionedNodes]);

  const getLinkCoordinates = useCallback((link: ForceGraphLink): [number, number][] => {
    const sourcePos = nodePositionMap.get(link.source);
    const targetPos = nodePositionMap.get(link.target);
    
    if (!sourcePos || !targetPos) return [];
    
    return [
      [sourcePos.lat, sourcePos.lng],
      [targetPos.lat, targetPos.lng]
    ];
  }, [nodePositionMap]);

  // Get link color based on signal strength and type - enhanced
  const getLinkColor = useCallback((link: ForceGraphLink): string => {
    // Use the same color logic as the topology graph
    // MQTT links get purple color
    if (link.isMqtt || link.isMqttBrokerLink) return '#8b5cf6'; // Purple for MQTT links
    
    // Use activity-based color for all other links (same as topology graph)
    return link.color || '#999999';
  }, []);

  // Get link opacity based on signal strength and type - enhanced
  const getLinkOpacity = useCallback((link: ForceGraphLink): number => {
    // Special link types get high opacity
    if (link.isMqtt || link.isMqttBrokerLink) return 0.9; // High opacity for MQTT links
    if (link.isDirectMultiHop) return 0.8; // Good opacity for direct multi-hop
    if (link.hops > 1) return 0.7; // Moderate opacity for multi-hop
    
    if (!settings.showSignalStrength) return 0.8;
    
    // Use signal strength (SNR + RSSI) to determine opacity (50% to 100%)
    const snr = link.snr || 0;
    const rssi = link.rssi || 0;
    
    // If no signal data, use default opacity
    if (snr === 0 && rssi === 0) return 0.7;
    
    // Calculate combined signal quality score
    // SNR scoring: -15 dB (poor) to +15 dB (excellent)
    const snrScore = Math.max(0, Math.min(1, (snr + 15) / 30));
    
    // RSSI scoring: -100 dBm (poor) to -40 dBm (excellent)  
    const rssiScore = Math.max(0, Math.min(1, (rssi + 100) / 60));
    
    // Combine scores with slight weight toward SNR
    const combinedScore = (snrScore * 0.6) + (rssiScore * 0.4);
    
    // Map to opacity range: 50% (poor signal) to 100% (excellent signal)
    return 0.5 + (combinedScore * 0.5);
  }, [settings.showSignalStrength]);

  // Link hover handlers
  const handleLinkHover = useCallback((link: ForceGraphLink, event: any) => {
    setHoveredLink(link);
    if (event.containerPoint) {
      setLinkHoverPosition({
        x: event.containerPoint.x,
        y: event.containerPoint.y
      });
    }
  }, []);

  const handleLinkLeave = useCallback(() => {
    setHoveredLink(null);
    setLinkHoverPosition(null);
  }, []);

  // Focus on random node handler
  const focusOnRandomNode = useCallback(() => {
    if (positionedNodes.length === 0 || !mapRef.current) return;
    
    const randomIndex = Math.floor(Math.random() * positionedNodes.length);
    const randomNode = positionedNodes[randomIndex];
    
    // Get the Leaflet map instance and fly to the random node
    const map = mapRef.current;
    if (map && map.flyTo) {
      map.flyTo([randomNode.lat, randomNode.lng], DEFAULT_ZOOM, {
        duration: 1.5 // Smooth animation duration in seconds
      });
    }
  }, [positionedNodes]);

  // Focus on specific node when navigated from topology view
  const focusOnNode = useCallback((nodeId: string) => {
    if (!mapRef.current) return;
    
    const targetNode = positionedNodes.find(node => node.node_id === nodeId);
    if (!targetNode) {
      console.warn(`Node with ID ${nodeId} not found in positioned nodes. This may be because the node has no GPS coordinates.`);
      // Try to focus on a random positioned node as fallback
      if (positionedNodes.length > 0) {
        const fallbackNode = positionedNodes[0];
        const map = mapRef.current;
        if (map && map.flyTo) {
          map.flyTo([fallbackNode.lat, fallbackNode.lng], DEFAULT_ZOOM, {
            duration: 1.5
          });
        }
      }
      return;
    }

    // Get the Leaflet map instance and fly to the target node
    const map = mapRef.current;
    if (map && map.flyTo) {
      map.flyTo([targetNode.lat, targetNode.lng], Math.max(DEFAULT_ZOOM, 15), {
        duration: 2.0 // Smooth animation duration in seconds
      });
      
      // Also select the node for detailed view
      setSelectedNode(targetNode);
    }
  }, [positionedNodes]);

  // Handle focus from context when navigating from other views
  useEffect(() => {
    if (shouldFocusOnLoad && focusedNodeId && positionedNodes.length > 0) {
      // Small delay to ensure map is fully rendered
      const timer = setTimeout(() => {
        focusOnNode(focusedNodeId);
        setShouldFocusOnLoad(false);
        setFocusedNodeId(null);
      }, 500);
      
      return () => clearTimeout(timer);
    }
  }, [shouldFocusOnLoad, focusedNodeId, positionedNodes, focusOnNode, setShouldFocusOnLoad, setFocusedNodeId]);



  // Create custom icon for nodes - memoized with node dependencies only
  const createNodeIcon = useCallback((node: PositionedNode, isMqttConnected: boolean, isMinimal: boolean) => {
    if (typeof window === 'undefined') return null;
    
    try {
      const L = require('leaflet');
      
      const color = node.color || BRAND_PRIMARY;
      const size = 24;
      
      const borderColor = isMqttConnected ? '#8b5cf6' : '#ffffff';
      const borderWidth = isMqttConnected ? 3 : 2;
      
      // Add visual indicator for spread nodes (artificially positioned)
      const isSpread = node.isManuallyPositioned;
      const spreadIndicator = isSpread ? `
        <circle cx="18" cy="6" r="3" fill="#f59e0b" stroke="#ffffff" stroke-width="1"/>
        <text x="18" y="8" text-anchor="middle" fill="#ffffff" font-size="6" font-weight="bold">S</text>
      ` : '';
      
      const svg = `
        <svg width="${size}" height="${size}" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <circle cx="12" cy="12" r="10" fill="${color}" stroke="${borderColor}" stroke-width="${borderWidth}"/>
          <text x="12" y="16" text-anchor="middle" fill="#ffffff" font-size="10" font-weight="bold">
            ${node.name.substring(0, 2).toUpperCase()}
          </text>
          ${spreadIndicator}
        </svg>
      `;
      
      return L.divIcon({
        html: svg,
        className: 'custom-node-icon',
        iconSize: [size, size],
        iconAnchor: [size/2, size/2]
      });
    } catch (error) {
      console.error('Error creating node icon:', error);
      return null;
    }
  }, []);

  // Memoize link rendering data with hover enhancements
  const linkRenderData = useMemo(() => {
    return visibleLinks.map((link, index) => {
      const coordinates = getLinkCoordinates(link);
      if (coordinates.length === 0) return null;
      
      // Enhanced styling for hovered link
      const isHovered = !!(hoveredLink && 
        hoveredLink.source === link.source && 
        hoveredLink.target === link.target);
      
      return {
        key: `link-${link.source}-${link.target}-${index}`,
        link,
        coordinates,
        color: getLinkColor(link),
        opacity: isHovered ? Math.min(1.0, getLinkOpacity(link) + 0.3) : getLinkOpacity(link),
        isHovered
      };
    }).filter((item): item is NonNullable<typeof item> => item !== null);
  }, [visibleLinks, getLinkCoordinates, getLinkColor, getLinkOpacity, hoveredLink]);

  return (
    <div className={`flex flex-col h-full ${className} light`}>
      {/* Header Controls */}
      <div className="p-3 sm:p-4 bg-white border-b border-gray-200 text-gray-900">
        {/* Title Section */}
        <div className="flex items-center space-x-2 min-w-0 mb-3">
          <h2 className="text-base sm:text-lg font-semibold text-gray-900 truncate">Network Map</h2>
          <span className="text-xs sm:text-sm text-gray-500 hidden sm:inline">
            {positionedNodes.length} nodes, {visibleLinks.length} links
            {mqttConnectedNodes.size > 0 && (
              <span className="text-purple-600"> • {mqttConnectedNodes.size} MQTT</span>
            )}
            {settings.maxHops > 0 && visibleLinks.some(link => link.hops > 0) && (
              <span className="text-purple-600"> • {visibleLinks.filter(link => link.hops > 0).length} multi-hop</span>
            )}
            {positionedNodes.some(node => node.isManuallyPositioned) && (
              <span className="text-amber-600"> • {positionedNodes.filter(node => node.isManuallyPositioned).length} spread</span>
            )}
          </span>
        </div>
        
        {/* Controls Section */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-1 sm:space-x-2 flex-wrap">
          {/* Map Type Toggle */}
          <div className="flex rounded-lg border border-gray-300 overflow-hidden bg-white">
            <button
              onClick={() => setSettings(prev => ({ 
                ...prev, 
                tileLayer: 'minimal'
              }))}
              className={`px-2 sm:px-3 py-1 text-sm font-medium transition-colors touch-manipulation ${
                settings.tileLayer === 'minimal'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-50'
              }`}
              title="Minimal View"
              style={{ minHeight: '36px' }}
            >
              <Minimize2 className="h-4 w-4" />
            </button>
            <button
              onClick={() => setSettings(prev => ({ ...prev, tileLayer: 'street' }))}
              className={`px-2 sm:px-3 py-1 text-sm font-medium transition-colors touch-manipulation ${
                settings.tileLayer === 'street'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-50'
              }`}
              title="Street Map"
              style={{ minHeight: '36px' }}
            >
              <MapIcon className="h-4 w-4" />
            </button>
            <button
              onClick={() => setSettings(prev => ({ ...prev, tileLayer: 'satellite' }))}
              className={`px-2 sm:px-3 py-1 text-sm font-medium transition-colors touch-manipulation ${
                settings.tileLayer === 'satellite'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-50'
              }`}
              title="Satellite View"
              style={{ minHeight: '36px' }}
            >
              <Satellite className="h-4 w-4" />
            </button>
          </div>
          
          {/* Focus Random Node */}
          <button
            onClick={focusOnRandomNode}
            disabled={positionedNodes.length === 0}
            className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors bg-white disabled:opacity-50"
            title="Focus on Random Node"
          >
            <Target className="h-4 w-4" />
          </button>
          
          {/* Settings */}
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors bg-white touch-manipulation"
            title="Settings"
            style={{ minHeight: '36px', minWidth: '36px' }}
          >
            <Settings className="h-4 w-4" />
          </button>
          
          <div className="flex flex-col items-center gap-1">
            <RefreshButton
              onRefresh={handleRefresh}
              isRefreshing={isLoading}
              disabled={isLoading}
              size="sm"
            />
          </div>
          </div>
        </div>
      </div>
      
      {/* Settings Panel */}
      {showSettings && (
        <div className="p-3 sm:p-4 bg-gray-50 border-b border-gray-200">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 sm:gap-4 mb-4 sm:mb-6">
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={settings.showNodeLabels}
                onChange={(e) => setSettings(prev => ({ ...prev, showNodeLabels: e.target.checked }))}
                className="rounded border-gray-300 bg-white text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700">Show Labels</span>
            </label>
            
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={settings.showSignalStrength}
                onChange={(e) => setSettings(prev => ({ ...prev, showSignalStrength: e.target.checked }))}
                className="rounded border-gray-300 bg-white text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700">Signal Strength</span>
            </label>
            
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={settings.showOnlyBidirectional}
                onChange={(e) => setSettings(prev => ({ ...prev, showOnlyBidirectional: e.target.checked }))}
                className="rounded border-gray-300 bg-white text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700">Bidirectional Only</span>
            </label>

            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={settings.showPositionAccuracy}
                onChange={(e) => setSettings(prev => ({ ...prev, showPositionAccuracy: e.target.checked }))}
                className="rounded border-gray-300 bg-white text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700">Position Accuracy</span>
            </label>

            <label className="flex items-center space-x-2">
              <span className="text-sm text-gray-700">Max Hops:</span>
              <select
                value={settings.maxHops}
                onChange={(e) => setSettings(prev => ({ ...prev, maxHops: parseInt(e.target.value) }))}
                className="rounded border-gray-300 text-sm bg-white text-gray-900"
                title="0 = direct links only; 1–7 include paths up to N hops"
              >
                {[0, 1, 2, 3, 4, 5, 6, 7].map(hops => (
                  <option key={hops} value={hops}>
                    {hops === 0 ? '0 (Direct only)' : `Up to ${hops}`}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex items-center space-x-2">
              <span className="text-sm text-gray-700">Activity:</span>
              <select
                value={settings.activityFilter}
                onChange={(e) => setSettings(prev => ({ ...prev, activityFilter: e.target.value as ActivityTimeRange }))}
                className="rounded border-gray-300 text-sm bg-white text-gray-900"
              >
                {getActivityTimeRanges().map(({ value, label }) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
          </div>

          {/* Link Legend */}
          <div className="border-t border-gray-300 pt-4">
            <h4 className="text-sm font-medium text-gray-800 mb-3">Link Types, Activity & Signal Strength</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
              
              {/* Connection Types */}
              <div>
                <h5 className="font-medium text-gray-700 mb-2">Connection Types</h5>
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <div className="w-6 h-1 bg-blue-500"></div>
                    <span className="text-gray-600">Direct Link</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="w-6 h-1 border-t-2 border-dashed border-purple-500"></div>
                    <span className="text-gray-600">Multi-hop</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="w-6 h-1 bg-purple-600"></div>
                    <span className="text-gray-600">MQTT Link</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="w-6 h-1 border-t-2 border-dashed border-amber-500" style={{ borderStyle: 'dashed', borderWidth: '2px 0 0 0' }}></div>
                    <span className="text-gray-600">Direct Multi-hop</span>
                  </div>
                </div>
              </div>

              {/* Link Activity Colors */}
              <div>
                <h5 className="font-medium text-gray-700 mb-2">Link Activity</h5>
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <div className="w-6 h-1 bg-green-600"></div>
                    <span className="text-gray-600">Recent Activity (&lt; 5 min)</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="w-6 h-1 bg-lime-500"></div>
                    <span className="text-gray-600">Active (&lt; 1 hour)</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="w-6 h-1 bg-yellow-500"></div>
                    <span className="text-gray-600">Moderate (&lt; 2 hours)</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="w-6 h-1 bg-orange-500"></div>
                    <span className="text-gray-600">Old (&lt; 24 hours)</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="w-6 h-1 bg-red-500"></div>
                    <span className="text-gray-600">Very Old (&gt; 24 hours)</span>
                  </div>
                </div>
              </div>

              {/* Signal Strength */}
              <div>
                <h5 className="font-medium text-gray-700 mb-2">Signal Strength</h5>
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <div className="w-6 h-1 bg-blue-500" style={{ height: '3px', opacity: 1.0 }}></div>
                    <span className="text-gray-600">Excellent (100% opacity)</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="w-6 h-1 bg-blue-500" style={{ height: '3px', opacity: 0.8 }}></div>
                    <span className="text-gray-600">Good (80% opacity)</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="w-6 h-1 bg-blue-500" style={{ height: '3px', opacity: 0.65 }}></div>
                    <span className="text-gray-600">Fair (65% opacity)</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="w-6 h-1 bg-blue-500" style={{ height: '3px', opacity: 0.5 }}></div>
                    <span className="text-gray-600">Poor (50% opacity)</span>
                  </div>
                </div>
              </div>

              {/* Node Indicators */}
              <div>
                <h5 className="font-medium text-gray-700 mb-2">Node Indicators</h5>
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <div className="w-6 h-6 rounded-full bg-blue-500 border-2 border-purple-500 relative">
                      <div className="absolute top-0 right-0 w-2 h-2 bg-purple-600 rounded-full"></div>
                    </div>
                    <span className="text-gray-600">MQTT Connected</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="w-6 h-6 rounded-full bg-blue-500 border-2 border-white relative">
                      <div className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-amber-500 rounded-full border border-white flex items-center justify-center">
                        <span className="text-white text-xs font-bold" style={{ fontSize: '8px' }}>S</span>
                      </div>
                    </div>
                    <span className="text-gray-600">Position Spread</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="w-6 h-6 rounded-full bg-blue-500 border-2 border-white"></div>
                    <span className="text-gray-600">GPS Position</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Error Message */}
      {error && (
        <div className="p-4 bg-red-50 border-b border-red-200">
          <p className="text-red-700">{error}</p>
        </div>
      )}
      
      {/* Map Container */}
      <div
        className="flex-1 relative"
        style={{ minHeight: '800px', height: 'calc(100vh - 150px)' }}
        onClick={e => {
          // Only hide if click is not on a control or popup
          if (
            e.target instanceof HTMLElement &&
            !e.target.closest('.leaflet-control') &&
            !e.target.closest('.leaflet-popup') &&
            !e.target.closest('.leaflet-marker-icon') &&
            !e.target.closest('.leaflet-pane') // allow marker drag etc.
          ) {
            setShowSettings(false);
          }
        }}
      >
        {isLoading && (
          <div className="absolute inset-0 bg-white bg-opacity-75 flex items-center justify-center z-[1000]">
            <div className="text-center">
              <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              <p className="text-gray-600">Loading network data...</p>
            </div>
          </div>
        )}
        
        {/* Render Map */}
        {typeof window !== 'undefined' ? (
          <div style={{ height: '100%', width: '100%' }}>
            <MapContainer
              ref={mapRef}
              center={mapCenter}
              zoom={DEFAULT_ZOOM}
              key={`map-${positionedNodes.length}`}
              style={{ height: '100%', width: '100%', minHeight: '800px' }}
              className="z-0"
            >
              <TileLayer
                url={TILE_LAYERS[settings.tileLayer].url}
                attribution={TILE_LAYERS[settings.tileLayer].attribution}
              />
              
              {/* Render Position Accuracy Circles FIRST (bottom layer) */}
              {settings.showPositionAccuracy && positionedNodes.map((node) => {
                if (!node.position_accuracy || node.position_accuracy <= 0) return null;
                
                // Convert precision bits to radius in meters
                const radiusInMeters = precisionBitsToRadius(node.position_accuracy);
                
                if (radiusInMeters <= 0) return null;
                
                // For very large radii (low precision), cap at a reasonable maximum for visibility
                const maxDisplayRadius = 5000; // 5km max display radius
                const displayRadius = Math.min(radiusInMeters, maxDisplayRadius);
                
                // For very small radii (high precision), set minimum for visibility
                const minDisplayRadius = 2; // 2m minimum display radius
                const finalRadius = Math.max(displayRadius, minDisplayRadius);
                
                // Color coding based on precision level
                let circleColor = BRAND_PRIMARY; // Default brand green
                if (radiusInMeters <= 5) circleColor = '#22c55e';      // Green - very precise (≤ 5m)
                else if (radiusInMeters <= 50) circleColor = '#eab308'; // Yellow - good precision (≤ 50m)
                else if (radiusInMeters <= 500) circleColor = '#f97316'; // Orange - moderate precision (≤ 500m)
                else circleColor = '#ef4444';                           // Red - poor precision (> 500m)
                
                return (
                  <Circle
                    key={`accuracy-${node.id}`}
                    center={[node.lat, node.lng]}
                    radius={finalRadius}
                    pathOptions={{
                      color: circleColor,
                      fillColor: circleColor,
                      fillOpacity: 0.08,
                      opacity: 0.5,
                      weight: 2,
                      dashArray: '5, 5'
                    }}
                  />
                );
              })}

              {/* Render Links SECOND (middle layer) */}
              {linkRenderData.map((linkData) => (
                <LinkWithHover
                  key={linkData.key}
                  link={linkData.link}
                  coordinates={linkData.coordinates}
                  color={linkData.color}
                  opacity={linkData.opacity}
                  isHovered={linkData.isHovered}
                  onHover={handleLinkHover}
                  onLeave={handleLinkLeave}
                />
              ))}
              
              {/* Render Nodes LAST (top layer) */}
              {positionedNodes.map((node) => {
                const isMqttConnected = mqttConnectedNodes.has(node.id);
                const isMinimal = settings.tileLayer === 'minimal';
                const icon = createNodeIcon(node, isMqttConnected, isMinimal);
                if (!icon) return null;
                
                return (
                  <Marker
                    key={node.id}
                    position={[node.lat, node.lng]}
                    icon={icon}
                    eventHandlers={{
                      click: () => handleNodeClick(node),
                      mouseover: (e) => {
                        const map = e.target._map;
                        const containerPoint = map.latLngToContainerPoint(e.latlng);
                        setHoveredNode(node);
                        setNodeHoverPosition({ 
                          x: containerPoint.x, 
                          y: containerPoint.y 
                        });
                      },
                      mouseout: () => {
                        setHoveredNode(null);
                        setNodeHoverPosition(null);
                      },
                    }}
                  >
                  </Marker>
                );
              })}
            </MapContainer>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full bg-blue-100 rounded-lg">
            <div className="text-blue-700">
              <p>Map component loading...</p>
              <p className="text-sm">Server-side rendering detected</p>
            </div>
          </div>
        )}

        {/* Selected Node Info */}
        {selectedNode && (
          <div className="absolute top-4 right-4 bg-white rounded-lg shadow-lg p-4 z-[1000] max-w-sm border border-gray-200 max-h-[80vh] overflow-y-auto">
            <h3 className="font-semibold text-lg mb-3 text-gray-900">
              {selectedNode.short_name && selectedNode.long_name 
                ? `${selectedNode.short_name} - ${selectedNode.long_name}`
                : selectedNode.short_name || selectedNode.long_name || selectedNode.name}
            </h3>
            
            <div className="space-y-3 text-sm">
              {/* Basic Information */}
              <div>
                <h4 className="font-medium text-gray-800 mb-1">Basic Information</h4>
                <div className="space-y-1 pl-2 border-l-2 border-blue-200">
                  <p><span className="font-medium text-gray-700">Node ID:</span> <span className="text-gray-600 font-mono">{selectedNode.node_id}</span></p>
                  <p><span className="font-medium text-gray-700">Short Name:</span> <span className="text-gray-600">{selectedNode.short_name || 'N/A'}</span></p>
                  <p><span className="font-medium text-gray-700">Long Name:</span> <span className="text-gray-600">{selectedNode.long_name || 'N/A'}</span></p>
                  {selectedNode.hw_model && (
                    <p><span className="font-medium text-gray-700">Hardware:</span> <span className="text-gray-600">{selectedNode.hw_model}</span></p>
                  )}
                  <p><span className="font-medium text-gray-700">Role:</span> <span className="text-gray-600">{selectedNode.role || 'Unknown'}</span></p>
                </div>
              </div>

              {/* Position Information */}
              <div>
                <h4 className="font-medium text-gray-800 mb-1">Position</h4>
                <div className="space-y-1 pl-2 border-l-2 border-green-200">
                  <p><span className="font-medium text-gray-700">Coordinates:</span> <span className="text-gray-600 font-mono">{selectedNode.lat.toFixed(6)}, {selectedNode.lng.toFixed(6)}</span></p>
                  {selectedNode.location_source !== undefined && selectedNode.location_source !== null && (
                    <p>
                      <span className="font-medium text-gray-700">Location Source:</span>
                      <span className="text-gray-600 ml-1">{formatLocationSourceLabel(selectedNode.location_source)}</span>
                    </p>
                  )}
                  {selectedNode.position_accuracy && (
                    <p>
                      <span className="font-medium text-gray-700">Accuracy:</span> 
                      <span className="text-gray-600">{selectedNode.position_accuracy} bits (~{precisionBitsToRadius(selectedNode.position_accuracy).toFixed(1)}m radius)</span>
                    </p>
                  )}
                  {selectedNode.isManuallyPositioned && (
                    <p>
                      <span className="font-medium text-gray-700">Display:</span> 
                      <span className="text-amber-600">Position spread due to overlap</span>
                    </p>
                  )}
                  {/* Note: altitude would need to be added to the types if available in the data */}
                </div>
              </div>

                            {/* Power & Battery */}
              {(selectedNode.battery_level || selectedNode.voltage || selectedNode.uptime_seconds) && (
                <div>
                  <h4 className="font-medium text-gray-800 mb-1">Power & System</h4>
                  <div className="space-y-1 pl-2 border-l-2 border-yellow-200">
                    {selectedNode.battery_level && (
                      <p><span className="font-medium text-gray-700">Battery:</span> <span className="text-gray-600">{selectedNode.battery_level}%</span></p>
                    )}
                    {selectedNode.voltage && (
                      <p><span className="font-medium text-gray-700">Voltage:</span> <span className="text-gray-600">{selectedNode.voltage}V</span></p>
                    )}
                    {selectedNode.uptime_seconds && (
                      <p><span className="font-medium text-gray-700">Uptime:</span> <span className="text-gray-600">{Math.floor(selectedNode.uptime_seconds / 3600)}h {Math.floor((selectedNode.uptime_seconds % 3600) / 60)}m</span></p>
                    )}
                  </div>
                </div>
              )}

              {/* Network Status */}
              <div>
                <h4 className="font-medium text-gray-800 mb-1">Network Status</h4>
                <div className="space-y-1 pl-2 border-l-2 border-purple-200">
                  <p><span className="font-medium text-gray-700">Last Seen:</span> <span className="text-gray-600">{new Date(selectedNode.last_seen).toLocaleString()}</span></p>
                  {selectedNode.first_seen && (
                    <p><span className="font-medium text-gray-700">First Seen:</span> <span className="text-gray-600">{new Date(selectedNode.first_seen).toLocaleString()}</span></p>
                  )}
                  {mqttConnectedNodes.has(selectedNode.id) && (
                    <p><span className="font-medium text-gray-700">MQTT:</span> <span className="text-purple-600 font-medium">Connected</span></p>
                  )}
                  {selectedNode.channel_utilization && (
                    <p><span className="font-medium text-gray-700">Channel Usage:</span> <span className="text-gray-600">{selectedNode.channel_utilization.toFixed(1)}%</span></p>
                  )}
                  {selectedNode.air_util_tx && (
                    <p><span className="font-medium text-gray-700">Air Time TX:</span> <span className="text-gray-600">{selectedNode.air_util_tx.toFixed(1)}%</span></p>
                  )}
                </div>
              </div>

              {/* Environmental Data */}
              {(selectedNode.temperature || selectedNode.relative_humidity || selectedNode.barometric_pressure || selectedNode.gas_resistance || selectedNode.iaq) && (
                <div>
                  <h4 className="font-medium text-gray-800 mb-1">Environmental</h4>
                  <div className="space-y-1 pl-2 border-l-2 border-cyan-200">
                    {selectedNode.temperature && (
                      <p><span className="font-medium text-gray-700">Temperature:</span> <span className="text-gray-600">{selectedNode.temperature}°C</span></p>
                    )}
                    {selectedNode.relative_humidity && (
                      <p><span className="font-medium text-gray-700">Humidity:</span> <span className="text-gray-600">{selectedNode.relative_humidity}%</span></p>
                    )}
                    {selectedNode.barometric_pressure && (
                      <p><span className="font-medium text-gray-700">Pressure:</span> <span className="text-gray-600">{selectedNode.barometric_pressure} hPa</span></p>
                    )}
                    {selectedNode.gas_resistance && (
                      <p><span className="font-medium text-gray-700">Gas Resistance:</span> <span className="text-gray-600">{selectedNode.gas_resistance.toFixed(0)} Ω</span></p>
                    )}
                    {selectedNode.iaq && (
                      <p><span className="font-medium text-gray-700">Air Quality Index:</span> <span className="text-gray-600">{selectedNode.iaq}</span></p>
                    )}
                  </div>
                </div>
              )}

              {/* Security & Configuration */}
              <div>
                <h4 className="font-medium text-gray-800 mb-1">Configuration</h4>
                <div className="space-y-1 pl-2 border-l-2 border-red-200">
                  {selectedNode.mac_address && (
                    <p><span className="font-medium text-gray-700">MAC:</span> <span className="text-gray-600 font-mono">{selectedNode.mac_address}</span></p>
                  )}
                  <p><span className="font-medium text-gray-700">Licensed:</span> <span className="text-gray-600">{selectedNode.is_licensed ? 'Yes' : 'No'}</span></p>
                  {selectedNode.is_unmessagable && (
                    <p><span className="font-medium text-gray-700">Messaging:</span> <span className="text-red-600">Disabled</span></p>
                  )}
                  {selectedNode.public_key && (
                    <p><span className="font-medium text-gray-700">Public Key:</span> <span className="text-gray-600 font-mono text-xs">{selectedNode.public_key.slice(0, 16)}...</span></p>
                  )}
                </div>
              </div>

              {/* Environmental Data */}
              {/* Note: These would need to be added to the ForceGraphNode type if available in the data */}
              {/* 
              {(selectedNode.temperature || selectedNode.relative_humidity || selectedNode.barometric_pressure) && (
                <div>
                  <h4 className="font-medium text-gray-800 mb-1">Environmental</h4>
                  <div className="space-y-1 pl-2 border-l-2 border-cyan-200">
                    {selectedNode.temperature && (
                      <p><span className="font-medium text-gray-700">Temperature:</span> <span className="text-gray-600">{selectedNode.temperature}°C</span></p>
                    )}
                    {selectedNode.relative_humidity && (
                      <p><span className="font-medium text-gray-700">Humidity:</span> <span className="text-gray-600">{selectedNode.relative_humidity}%</span></p>
                    )}
                    {selectedNode.barometric_pressure && (
                      <p><span className="font-medium text-gray-700">Pressure:</span> <span className="text-gray-600">{selectedNode.barometric_pressure} hPa</span></p>
                    )}
                  </div>
                </div>
              )}
              */}
            </div>
            
            <button
              onClick={() => setSelectedNode(null)}
              className="mt-4 w-full px-3 py-2 bg-gray-100 text-gray-700 rounded text-sm hover:bg-gray-200 border border-gray-300 transition-colors"
            >
              Close
            </button>
          </div>
        )}

        {/* Link Hover Info */}
        {hoveredLink && linkHoverPosition && (
          <div 
            className="absolute bg-black bg-opacity-90 text-white text-sm rounded-lg p-4 z-[1001] pointer-events-none max-w-sm shadow-lg border border-gray-600"
            style={{
              left: linkHoverPosition.x + 10,
              top: linkHoverPosition.y - 10
            }}
          >
            <div className="space-y-3">
              {/* Connection Header */}
              <div className="border-b border-gray-600 pb-2">
                <h4 className="font-medium text-white text-base mb-1">Link Information</h4>
                <p className="text-gray-200">
                  <span className="font-medium">{hoveredLink.source}</span> 
                  <span className="mx-2 text-gray-400">↔</span> 
                  <span className="font-medium">{hoveredLink.target}</span>
                </p>
              </div>

              {/* Link Quality Section */}
              <div className="space-y-1">
                <h5 className="font-medium text-gray-300 text-xs uppercase tracking-wide">Link Quality</h5>
                
                {hoveredLink.rssi !== undefined && hoveredLink.rssi !== 0 ? (
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400">RSSI:</span>
                    <span className={`font-mono ${
                      hoveredLink.rssi >= -50 ? 'text-green-400' :
                      hoveredLink.rssi >= -70 ? 'text-yellow-400' :
                      hoveredLink.rssi >= -90 ? 'text-orange-400' : 'text-red-400'
                    }`}>
                      {hoveredLink.rssi} dBm
                    </span>
                  </div>
                ) : (
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400">RSSI:</span>
                    <span className="text-gray-500 text-xs italic">No data</span>
                  </div>
                )}

                {hoveredLink.snr !== undefined && hoveredLink.snr !== 0 ? (
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400">SNR:</span>
                    <span className={`font-mono ${
                      hoveredLink.snr >= 10 ? 'text-green-400' :
                      hoveredLink.snr >= 5 ? 'text-yellow-400' :
                      hoveredLink.snr >= 0 ? 'text-orange-400' : 'text-red-400'
                    }`}>
                      {hoveredLink.snr} dB
                    </span>
                  </div>
                ) : (
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400">SNR:</span>
                    <span className="text-gray-500 text-xs italic">No data</span>
                  </div>
                )}

                {/* Link Quality Indicator */}
                {(hoveredLink.rssi !== undefined && hoveredLink.rssi !== 0) || (hoveredLink.snr !== undefined && hoveredLink.snr !== 0) && (
                  <div className="mt-2">
                    <span className="text-gray-400 text-xs">Quality: </span>
                    <span className={`text-xs font-medium ${
                      (hoveredLink.rssi >= -50 && hoveredLink.snr >= 10) ? 'text-green-400' :
                      (hoveredLink.rssi >= -70 && hoveredLink.snr >= 5) ? 'text-yellow-400' :
                      (hoveredLink.rssi >= -90 && hoveredLink.snr >= 0) ? 'text-orange-400' : 'text-red-400'
                    }`}>
                      {(hoveredLink.rssi >= -50 && hoveredLink.snr >= 10) ? 'Excellent' :
                       (hoveredLink.rssi >= -70 && hoveredLink.snr >= 5) ? 'Good' :
                       (hoveredLink.rssi >= -90 && hoveredLink.snr >= 0) ? 'Fair' : 'Poor'}
                    </span>
                  </div>
                )}
              </div>

              {/* Connection Type Section */}
              <div className="space-y-1">
                <h5 className="font-medium text-gray-300 text-xs uppercase tracking-wide">Connection Type</h5>
                
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Hops:</span>
                  <span className={`font-mono ${hoveredLink.hops === 0 ? 'text-green-400' : 'text-purple-400'}`}>
                    {hoveredLink.hops === 0 ? 'Direct' : hoveredLink.hops}
                    {hoveredLink.hops > 0 && <span className="text-purple-300 ml-1 text-xs">(Multi-hop)</span>}
                  </span>
                </div>

                {/* Directionality Analysis */}
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Direction:</span>
                  <span className="text-cyan-400 text-xs">
                    {/* For now we'll show bidirectional, but this could be enhanced based on actual data */}
                    Bidirectional
                  </span>
                </div>

                {/* Link Type Indicators */}
                {hoveredLink.isMqtt && (
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400">Type:</span>
                    <span className="text-purple-400 text-xs font-medium">MQTT</span>
                  </div>
                )}

                {hoveredLink.isMqttBrokerLink && (
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400">Broker:</span>
                    <span className="text-purple-400 text-xs font-medium">Connected</span>
                  </div>
                )}

                {hoveredLink.isDirectMultiHop && (
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400">Path:</span>
                    <span className="text-orange-400 text-xs font-medium">Direct Multi-hop</span>
                  </div>
                )}
              </div>

              {/* Timestamp Section */}
              <div className="space-y-1">
                <h5 className="font-medium text-gray-300 text-xs uppercase tracking-wide">Activity</h5>
                
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Last Seen:</span>
                  <span className="text-gray-200 text-xs">
                    {new Date(hoveredLink.last_seen).toLocaleString()}
                  </span>
                </div>

                {/* Time since last activity */}
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Age:</span>
                  <span className="text-gray-200 text-xs">
                    {(() => {
                      const now = new Date();
                      const lastSeen = new Date(hoveredLink.last_seen);
                      const diffMs = now.getTime() - lastSeen.getTime();
                      const diffMins = Math.floor(diffMs / 60000);
                      const diffHours = Math.floor(diffMins / 60);
                      const diffDays = Math.floor(diffHours / 24);
                      
                      if (diffDays > 0) return `${diffDays}d ${diffHours % 24}h`;
                      if (diffHours > 0) return `${diffHours}h ${diffMins % 60}m`;
                      if (diffMins > 0) return `${diffMins}m`;
                      return 'Just now';
                    })()}
                  </span>
                </div>
              </div>

              {/* Multi-hop Path Information */}
              {hoveredLink.hops > 0 && (
                <div className="border-t border-gray-600 pt-2 mt-2">
                  <p className="text-purple-300 text-xs leading-relaxed">
                    <span className="font-medium">Multi-hop path:</span> This connection routes through {hoveredLink.hops} intermediate node{hoveredLink.hops > 1 ? 's' : ''} to reach its destination.
                  </p>
                  {hoveredLink.originalHops && hoveredLink.originalHops !== hoveredLink.hops && (
                    <p className="text-orange-300 text-xs mt-1">
                      Original path: {hoveredLink.originalHops} hops
                    </p>
                  )}
                </div>
              )}

              {/* Additional Technical Info */}
              <div className="border-t border-gray-600 pt-2 mt-2 text-xs text-gray-400">
                <div className="grid grid-cols-2 gap-2">
                  {hoveredLink.distance && (
                    <div>
                      <span className="text-gray-500">Distance:</span>
                      <span className="text-gray-300 ml-1">{hoveredLink.distance.toFixed(0)}m</span>
                    </div>
                  )}
                  {hoveredLink.width && (
                    <div>
                      <span className="text-gray-500">Weight:</span>
                      <span className="text-gray-300 ml-1">{hoveredLink.width.toFixed(1)}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
