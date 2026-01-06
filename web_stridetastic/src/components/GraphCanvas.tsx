import React, { useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import dynamic from 'next/dynamic';
import { ForceGraphNode, ForceGraphLink } from '@/types';

const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), { ssr: false });

export interface GraphCanvasRef {
  zoom: (scale?: number) => number | void;
  zoomToFit: (duration?: number) => void;
  getZoom: () => number;
}

interface GraphCanvasProps {
  graphData: { nodes: ForceGraphNode[], links: ForceGraphLink[] };
  dimensions: { width: number; height: number };
  onNodeClick: (node: any) => void;
  onBackgroundClick: () => void;
  getNodeColor: (node: any) => string;
  getLinkColor: (link: any) => string;
  getLinkWidth: (link: any) => number;
  getLinkCurvature: (link: any) => number;
  getLinkLineDash: (link: any) => number[] | null;
  getLinkLabel: (link: any) => string;
  getNodeSize: (node: any) => number;
  renderNodeCanvas?: (node: any, ctx: any, globalScale: any) => void;
  nodePointerAreaPaint?: (node: any, color: string, ctx: any, globalScale: any) => void;
  minZoom?: number;
  maxZoom?: number;
}

export const GraphCanvas = forwardRef<GraphCanvasRef, GraphCanvasProps>(({
  graphData,
  dimensions,
  onNodeClick,
  onBackgroundClick,
  getNodeColor,
  getLinkColor,
  getLinkWidth,
  getLinkCurvature,
  getLinkLineDash,
  getLinkLabel,
  getNodeSize,
  renderNodeCanvas,
  nodePointerAreaPaint,
  minZoom = 0.2,
  maxZoom = 6,
}, ref) => {
  const fgRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useImperativeHandle(ref, () => ({
    zoom: (scale?: number) => {
      if (fgRef.current) {
        if (scale !== undefined) {
          fgRef.current.zoom(scale);
        } else {
          return fgRef.current.zoom();
        }
      }
    },
    zoomToFit: (duration = 400) => {
      if (fgRef.current) {
        fgRef.current.zoomToFit(duration);
      }
    },
    getZoom: () => fgRef.current?.zoom() || 1,
  }));
  GraphCanvas.displayName = 'GraphCanvas';

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const clampZoom = (value: number) => Math.min(maxZoom, Math.max(minZoom, value));
    const getDistance = (t1: Touch, t2: Touch) => Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
    const getMidpoint = (t1: Touch, t2: Touch) => ({
      x: (t1.clientX + t2.clientX) / 2,
      y: (t1.clientY + t2.clientY) / 2,
    });

    type InteractionMode = 'idle' | 'pan' | 'pinch';

    interface PanState {
      touchId: number;
      startScreen: { x: number; y: number };
      startGraph: { x: number; y: number };
      moved: boolean;
      startTime: number;
    }

    interface PinchState {
      touchIds: [number, number];
      startDistance: number;
      startMidGraph: { x: number; y: number };
      startZoom: number;
    }

    const state: { mode: InteractionMode; pan: PanState | null; pinch: PinchState | null } = {
      mode: 'idle',
      pan: null,
      pinch: null,
    };

  GraphCanvas.displayName = 'GraphCanvas';
    container.style.touchAction = 'none';
    container.style.overscrollBehavior = 'contain';

    const tapMaxDistancePx = 12;
    const tapMaxDurationMs = 300;

  // Translate a quick tap into the mouse events that ForceGraph listens for.
  const dispatchSyntheticClick = (touch: Touch) => {
      const canvases = Array.from(container.querySelectorAll('canvas')) as HTMLCanvasElement[];
      if (canvases.length === 0) {
        return;
      }

      const eventInit: MouseEventInit = {
        bubbles: true,
        cancelable: true,
        clientX: touch.clientX,
        clientY: touch.clientY,
        screenX: touch.screenX,
        screenY: touch.screenY,
        button: 0,
        buttons: 1,
      };

      for (const canvas of canvases) {
        canvas.dispatchEvent(new MouseEvent('mousedown', eventInit));
        canvas.dispatchEvent(new MouseEvent('mouseup', eventInit));
        canvas.dispatchEvent(new MouseEvent('click', eventInit));
      }
    };

    const handleTouchStart = (event: TouchEvent) => {
      if (!fgRef.current) {
        return;
      }

      if (event.touches.length >= 2) {
        const [touch1, touch2] = [event.touches[0], event.touches[1]];
        const distance = getDistance(touch1, touch2);
        if (!Number.isFinite(distance) || distance <= 0) {
          return;
        }

        const mid = getMidpoint(touch1, touch2);
        state.mode = 'pinch';
        state.pinch = {
          touchIds: [touch1.identifier, touch2.identifier],
          startDistance: distance,
          startMidGraph: fgRef.current.screen2GraphCoords(mid.x, mid.y),
          startZoom: fgRef.current.zoom(),
        };
        state.pan = null;
        event.preventDefault();
        return;
      }

      const touch = event.touches[0];
      if (!touch) {
        return;
      }

      state.mode = 'pan';
      state.pan = {
        touchId: touch.identifier,
        startScreen: { x: touch.clientX, y: touch.clientY },
        startGraph: fgRef.current.screen2GraphCoords(touch.clientX, touch.clientY),
        moved: false,
        startTime: event.timeStamp,
      };
      state.pinch = null;
    };

    const handleTouchMove = (event: TouchEvent) => {
      if (!fgRef.current) {
        return;
      }

      if (state.mode === 'pinch' && state.pinch) {
        const pinchState = state.pinch;
        const touches = Array.from(event.touches);
        const t1 = touches.find((t) => t.identifier === pinchState.touchIds[0]);
        const t2 = touches.find((t) => t.identifier === pinchState.touchIds[1]);
        if (!t1 || !t2) {
          return;
        }

        const distance = getDistance(t1, t2);
        if (!Number.isFinite(distance) || distance <= 0) {
          return;
        }

        const scale = distance / pinchState.startDistance;
        const newZoom = clampZoom(pinchState.startZoom * scale);
        fgRef.current.zoom(newZoom, 0);

        const mid = getMidpoint(t1, t2);
        const currentCenter = fgRef.current.centerAt();
        const currentMidGraph = fgRef.current.screen2GraphCoords(mid.x, mid.y);
        const dx = currentMidGraph.x - pinchState.startMidGraph.x;
        const dy = currentMidGraph.y - pinchState.startMidGraph.y;
        fgRef.current.centerAt(currentCenter.x - dx, currentCenter.y - dy, 0);

        event.preventDefault();
        return;
      }

      if (state.mode === 'pan' && state.pan) {
        const panState = state.pan;
        const touch = Array.from(event.touches).find((t) => t.identifier === panState.touchId);
        if (!touch) {
          return;
        }

        const deltaX = touch.clientX - panState.startScreen.x;
        const deltaY = touch.clientY - panState.startScreen.y;
        const traveled = Math.hypot(deltaX, deltaY);
        if (!panState.moved && traveled > 6) {
          panState.moved = true;
        }

        if (panState.moved) {
          const currentCenter = fgRef.current.centerAt();
          const currentGraph = fgRef.current.screen2GraphCoords(touch.clientX, touch.clientY);
          const dx = currentGraph.x - panState.startGraph.x;
          const dy = currentGraph.y - panState.startGraph.y;
          fgRef.current.centerAt(currentCenter.x - dx, currentCenter.y - dy, 0);
          event.preventDefault();
        }
      }
    };

    const handleTouchEnd = (event: TouchEvent) => {
      if (!fgRef.current) {
        return;
      }

      if (state.mode === 'pinch') {
        if (event.touches.length >= 2) {
          const [touch1, touch2] = [event.touches[0], event.touches[1]];
          const distance = getDistance(touch1, touch2);
          if (!Number.isFinite(distance) || distance <= 0) {
            state.mode = 'idle';
            state.pinch = null;
            return;
          }

          const mid = getMidpoint(touch1, touch2);
          state.pinch = {
            touchIds: [touch1.identifier, touch2.identifier],
            startDistance: distance,
            startMidGraph: fgRef.current.screen2GraphCoords(mid.x, mid.y),
            startZoom: fgRef.current.zoom(),
          };
          event.preventDefault();
          return;
        }

        if (event.touches.length === 1) {
          const touch = event.touches[0];
          state.mode = 'pan';
          state.pinch = null;
          state.pan = {
            touchId: touch.identifier,
            startScreen: { x: touch.clientX, y: touch.clientY },
            startGraph: fgRef.current.screen2GraphCoords(touch.clientX, touch.clientY),
            moved: false,
            startTime: event.timeStamp,
          };
          return;
        }

        state.mode = 'idle';
        state.pinch = null;
      }

      if (state.mode === 'pan' && state.pan) {
        const panState = state.pan;
        const stillActive = Array.from(event.touches).some((t) => t.identifier === panState.touchId);
        if (!stillActive) {
          const endTouch = Array.from(event.changedTouches).find((t) => t.identifier === panState.touchId);
          if (endTouch) {
            const deltaX = endTouch.clientX - panState.startScreen.x;
            const deltaY = endTouch.clientY - panState.startScreen.y;
            const distance = Math.hypot(deltaX, deltaY);
            const duration = event.timeStamp - panState.startTime;

            const isTap = !panState.moved && distance <= tapMaxDistancePx && duration <= tapMaxDurationMs;

            if (isTap) {
              dispatchSyntheticClick(endTouch);
              event.preventDefault();
            } else if (panState.moved) {
              event.preventDefault();
            }
          }
          state.mode = 'idle';
          state.pan = null;
        }
      }
    };

    container.addEventListener('touchstart', handleTouchStart, { passive: false });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('touchend', handleTouchEnd);
    container.addEventListener('touchcancel', handleTouchEnd);

    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
      container.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, [minZoom, maxZoom]);

  const defaultNodeCanvas = (node: any, ctx: any, globalScale: any) => {
    const nodeSize = getNodeSize(node);
    const nodeColor = getNodeColor(node);

    // Draw the node circle
    ctx.beginPath();
    ctx.arc(node.x, node.y, nodeSize, 0, 2 * Math.PI, false);
    ctx.fillStyle = nodeColor;
    ctx.fill();
    
    // Draw label for non-hidden nodes
    if (!node.isHidden) {
      const label = node.name || node.id.slice(-4);
      const baseFontSize = 12;
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
  };

  return (
    <div ref={containerRef} className="w-full h-full force-graph-touch-container">
      <ForceGraph2D
        ref={fgRef}
        graphData={graphData}
        width={dimensions.width}
        height={dimensions.height}
        nodeLabel={(node: any) => node.name || node.id}
        nodeId="id"
        nodeVal={getNodeSize}
        nodeColor={getNodeColor}
        nodeCanvasObject={renderNodeCanvas || defaultNodeCanvas}
        nodePointerAreaPaint={nodePointerAreaPaint}
        linkSource="source"
        linkTarget="target"
        linkColor={getLinkColor}
        linkWidth={getLinkWidth}
        linkCurvature={getLinkCurvature}
        linkLineDash={getLinkLineDash}
        linkDirectionalArrowLength={4}
        linkDirectionalArrowRelPos={1}
        linkLabel={getLinkLabel}
        d3AlphaDecay={0.02}
        d3VelocityDecay={0.3}
        onNodeClick={onNodeClick}
        onBackgroundClick={onBackgroundClick}
        cooldownTicks={1000}
        minZoom={minZoom}
        maxZoom={maxZoom}
      />
    </div>
  );
});

GraphCanvas.displayName = 'GraphCanvas';
