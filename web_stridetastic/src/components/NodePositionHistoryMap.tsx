'use client';

import React, { useMemo } from 'react';
import dynamic from 'next/dynamic';
import { NodePositionHistoryEntry } from '@/types';
import { formatLocationSourceLabel } from '@/lib/position';
import { BRAND_PRIMARY, BRAND_PRIMARY_DARK } from '@/lib/brandColors';

const MapContainer = dynamic(
  () => import('react-leaflet').then((mod) => mod.MapContainer),
  { ssr: false }
);
const TileLayer = dynamic(
  () => import('react-leaflet').then((mod) => mod.TileLayer),
  { ssr: false }
);
const Polyline = dynamic(
  () => import('react-leaflet').then((mod) => mod.Polyline),
  { ssr: false }
);
const CircleMarker = dynamic(
  () => import('react-leaflet').then((mod) => mod.CircleMarker),
  { ssr: false }
);
const Tooltip = dynamic(
  () => import('react-leaflet').then((mod) => mod.Tooltip),
  { ssr: false }
);

interface NodePositionHistoryMapProps {
  positions: NodePositionHistoryEntry[];
  className?: string;
}

const TILE_LAYER = {
  url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
};

const PATH_COLOR = BRAND_PRIMARY_DARK;
const INTERMEDIATE_MARKER_COLOR = BRAND_PRIMARY;

function formatTimestamp(value: string): string {
  try {
    return new Date(value).toLocaleString();
  } catch (_error) {
    return value;
  }
}

export default function NodePositionHistoryMap({ positions, className = '' }: NodePositionHistoryMapProps) {
  const hasWindow = typeof window !== 'undefined';
  const polylinePositions = useMemo(
    () => positions.map((entry) => [entry.latitude, entry.longitude] as [number, number]),
    [positions]
  );
  const latestPosition = polylinePositions[polylinePositions.length - 1] ?? polylinePositions[0];

  const bounds = useMemo(() => {
    if (!hasWindow || polylinePositions.length < 2) {
      return undefined;
    }
    const L = require('leaflet');
    return L.latLngBounds(polylinePositions);
  }, [hasWindow, polylinePositions]);

  if (!hasWindow) {
    return (
      <div className={`flex items-center justify-center h-60 rounded-lg border border-gray-200 bg-gray-50 text-gray-500 ${className}`}>
        Preparing map…
      </div>
    );
  }

  if (!latestPosition) {
    return (
      <div className={`flex items-center justify-center h-60 rounded-lg border border-gray-200 bg-gray-50 text-gray-500 ${className}`}>
        No positional data available
      </div>
    );
  }

  return (
    <div className={`relative h-60 w-full overflow-hidden rounded-lg border border-gray-200 ${className}`}>
      <MapContainer
        center={latestPosition}
        zoom={13}
        bounds={bounds}
        scrollWheelZoom={false}
        style={{ height: '100%', width: '100%' }}
        className="z-0"
      >
        <TileLayer url={TILE_LAYER.url} attribution={TILE_LAYER.attribution} />

        {polylinePositions.length > 1 && (
          <Polyline positions={polylinePositions} color={PATH_COLOR} weight={3} opacity={0.75} />
        )}

        {polylinePositions.map((coords, index) => {
          const entry = positions[index];
          const isLatest = index === polylinePositions.length - 1;
          const isFirst = index === 0;
          const color = isLatest ? '#16a34a' : isFirst ? '#dc2626' : INTERMEDIATE_MARKER_COLOR;

          return (
            <CircleMarker
              key={`${entry.timestamp}-${index}`}
              center={coords}
              radius={isLatest ? 6 : 4}
              pathOptions={{ color, fillColor: color, fillOpacity: 0.9, opacity: 0.8 }}
            >
              <Tooltip direction="top" offset={[0, -6]} opacity={0.9} sticky>
                <div className="text-xs text-gray-100">
                  <div className="font-medium">{isLatest ? 'Latest position' : isFirst ? 'First position' : 'Recorded position'}</div>
                  <div>{formatTimestamp(entry.timestamp)}</div>
                  {entry.location_source !== undefined && entry.location_source !== null && (
                    <div>Location Source: {formatLocationSourceLabel(entry.location_source)}</div>
                  )}
                  {typeof entry.accuracy === 'number' && (
                    <div>Accuracy: {entry.accuracy} m</div>
                  )}
                  {typeof entry.altitude === 'number' && (
                    <div>Altitude: {entry.altitude} m</div>
                  )}
                  {typeof entry.sequence_number === 'number' && (
                    <div>Sequence: {entry.sequence_number}</div>
                  )}
                </div>
              </Tooltip>
            </CircleMarker>
          );
        })}
      </MapContainer>
    </div>
  );
}
