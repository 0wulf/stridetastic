import { useState, useEffect, useCallback, useRef } from 'react';

interface GraphDimensions {
  width: number;
  height: number;
}

export function useGraphDimensions() {
  const [dimensions, setDimensions] = useState<GraphDimensions>({
    width: 800,
    height: 600,
  });
  const containerRef = useRef<HTMLElement | null>(null);

  const updateDimensions = useCallback(() => {
    const container = containerRef.current ?? document.getElementById('graph-container');
    if (container) {
      containerRef.current = container;
      setDimensions({
        width: container.clientWidth,
        height: container.clientHeight,
      });
    }
  }, []);

  useEffect(() => {
    const container = document.getElementById('graph-container');
    if (container) {
      containerRef.current = container;
      updateDimensions();

      if (typeof ResizeObserver !== 'undefined') {
        const resizeObserver = new ResizeObserver(() => {
          updateDimensions();
        });

        resizeObserver.observe(container);

        return () => {
          resizeObserver.disconnect();
          window.removeEventListener('resize', updateDimensions);
        };
      }
    }

    updateDimensions();
    window.addEventListener('resize', updateDimensions);

    return () => {
      window.removeEventListener('resize', updateDimensions);
    };
  }, [updateDimensions]);

  return { dimensions, updateDimensions };
}
