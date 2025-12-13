'use client';

import React, { createContext, useContext, useState, ReactNode } from 'react';

interface MapFocusContextType {
  focusedNodeId: string | null;
  setFocusedNodeId: (nodeId: string | null) => void;
  shouldFocusOnLoad: boolean;
  setShouldFocusOnLoad: (should: boolean) => void;
}

const MapFocusContext = createContext<MapFocusContextType | undefined>(undefined);

export function MapFocusProvider({ children }: { children: ReactNode }) {
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
  const [shouldFocusOnLoad, setShouldFocusOnLoad] = useState(false);

  return (
    <MapFocusContext.Provider 
      value={{ 
        focusedNodeId, 
        setFocusedNodeId, 
        shouldFocusOnLoad, 
        setShouldFocusOnLoad 
      }}
    >
      {children}
    </MapFocusContext.Provider>
  );
}

export function useMapFocus() {
  const context = useContext(MapFocusContext);
  if (context === undefined) {
    throw new Error('useMapFocus must be used within a MapFocusProvider');
  }
  return context;
}
