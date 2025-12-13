export interface SparklineInputPoint {
  timestamp: number | string | Date;
  value: number;
}

export interface SparklineComputeOptions {
  width: number;
  height: number;
  leftPadding?: number;
  rightPadding?: number;
  topPadding?: number;
  bottomPadding?: number;
}

export interface SparklineSeriesPoint {
  timestamp: number;
  value: number;
  x: number;
  y: number;
}

export interface SparklineSeries {
  width: number;
  height: number;
  path: string;
  areaPath: string;
  points: SparklineSeriesPoint[];
  minValue: number;
  maxValue: number;
  latestValue: number;
  firstTimestamp: number;
  lastTimestamp: number;
  baselineY: number;
  topY: number;
  leftX: number;
  rightX: number;
}

export function computeSparklineSeries(
  rawPoints: SparklineInputPoint[],
  options: SparklineComputeOptions,
): SparklineSeries | null {
  const { width, height } = options;
  if (width <= 0 || height <= 0) {
    return null;
  }

  const leftPadding = options.leftPadding ?? 0;
  const rightPadding = options.rightPadding ?? 0;
  const topPadding = options.topPadding ?? 0;
  const bottomPadding = options.bottomPadding ?? 0;

  const drawableWidth = width - leftPadding - rightPadding;
  const drawableHeight = height - topPadding - bottomPadding;

  if (drawableWidth <= 0 || drawableHeight <= 0) {
    return null;
  }

  const parsedPoints = rawPoints
    .map((point) => {
      let timestamp: number | null = null;
      if (point.timestamp instanceof Date) {
        timestamp = point.timestamp.getTime();
      } else if (typeof point.timestamp === 'string') {
        const date = new Date(point.timestamp);
        timestamp = Number.isNaN(date.getTime()) ? null : date.getTime();
      } else if (typeof point.timestamp === 'number') {
        timestamp = Number.isFinite(point.timestamp) ? point.timestamp : null;
      }

      const value = Number(point.value);
      if (timestamp === null || !Number.isFinite(value)) {
        return null;
      }

      return {
        timestamp,
        value,
      };
    })
    .filter((point): point is { timestamp: number; value: number } => point !== null);

  if (!parsedPoints.length) {
    return null;
  }

  const sortedPoints = [...parsedPoints].sort((a, b) => a.timestamp - b.timestamp);

  const firstTimestamp = sortedPoints[0].timestamp;
  const lastTimestamp = sortedPoints[sortedPoints.length - 1].timestamp;
  const minValue = sortedPoints.reduce((min, point) => Math.min(min, point.value), sortedPoints[0].value);
  const maxValue = sortedPoints.reduce((max, point) => Math.max(max, point.value), sortedPoints[0].value);

  const timeSpan = Math.max(lastTimestamp - firstTimestamp, 1);
  const valueSpan = Math.max(maxValue - minValue, 1);
  const baselineY = height - bottomPadding;
  const topY = topPadding;
  const leftX = leftPadding;
  const rightX = width - rightPadding;

  const points: SparklineSeriesPoint[] = sortedPoints.map((point) => {
    const x = leftPadding + ((point.timestamp - firstTimestamp) / timeSpan) * drawableWidth;
    const normalisedValue = maxValue === minValue ? 0.5 : (point.value - minValue) / valueSpan;
    const y = baselineY - normalisedValue * drawableHeight;
    return {
      timestamp: point.timestamp,
      value: point.value,
      x,
      y,
    };
  });

  const path = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(' ');

  const areaPath = `${path} L${rightX.toFixed(2)} ${baselineY.toFixed(2)} L${leftX.toFixed(2)} ${baselineY.toFixed(2)} Z`;

  return {
    width,
    height,
    path,
    areaPath,
    points,
    minValue,
    maxValue,
    latestValue: points[points.length - 1].value,
    firstTimestamp,
    lastTimestamp,
    baselineY,
    topY,
    leftX,
    rightX,
  };
}
