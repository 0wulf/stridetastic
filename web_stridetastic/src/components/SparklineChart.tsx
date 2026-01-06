'use client';

import React, { useMemo } from 'react';
import type { SparklineSeries, SparklineSeriesPoint } from '@/lib/charts/sparkline';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  Area,
  Tooltip,
  XAxis,
  YAxis,
  ReferenceLine,
  CartesianGrid,
} from 'recharts';

export interface SparklineSeriesConfig {
  id: string;
  series: SparklineSeries;
  color: string;
  showArea?: boolean;
  areaOpacity?: number;
  strokeWidth?: number;
  strokeDasharray?: string;
  showDots?: boolean;
  dotRadius?: number;
  highlightLatest?: boolean;
  formatTooltip?: (point: SparklineSeriesPoint) => string;
}

export interface SparklineChartProps {
  seriesList: SparklineSeriesConfig[];
  width: number;
  height: number;
  className?: string;
  ariaLabel?: string;
  backgroundFill?: string;
  showBaseline?: boolean;
  baselineColor?: string;
  showTopGuide?: boolean;
  topGuideColor?: string;
  topGuideDasharray?: string;
  showYAxisLabels?: boolean;
  yAxisLabelFormatter?: (value: number) => string;
  yAxisLabelColor?: string;
  yAxisLabelFontSize?: number;
  // X axis optional labels and formatter
  showXAxisLabels?: boolean;
  xAxisLabelFormatter?: (value: number) => string;
  xAxisLabelColor?: string;
  xAxisLabelFontSize?: number;
}

export function SparklineChart({
  seriesList,
  width,
  height,
  className,
  ariaLabel,
  backgroundFill = 'transparent',
  showBaseline = true,
  baselineColor = '#d1d5db',
  showTopGuide = false,
  topGuideColor = '#e5e7eb',
  topGuideDasharray = '4 4',
  showYAxisLabels = false,
  yAxisLabelFormatter,
  yAxisLabelColor = '#6b7280',
  yAxisLabelFontSize = 11,
  showXAxisLabels = false,
  xAxisLabelFormatter,
  xAxisLabelColor = '#6b7280',
  xAxisLabelFontSize = 11,
}: SparklineChartProps): React.JSX.Element {
  // Build unified data keyed by timestamp
  const data = useMemo(() => {
    const timestamps = new Set<number>();
    seriesList.forEach((s) => s.series.points.forEach((p) => timestamps.add(p.timestamp)));
    const sorted = Array.from(timestamps).sort((a, b) => a - b);
    return sorted.map((ts) => {
      const row: Record<string, number | null | Date> = { timestamp: ts };
      seriesList.forEach((s) => {
        const find = s.series.points.find((p) => p.timestamp === ts);
        row[`s_${s.id}`] = find ? find.value : null;
      });
      return row;
    });
  }, [seriesList]);

  if (!seriesList.length) {
    return (
      <div
        className={`flex h-full w-full items-center justify-center text-sm text-gray-500 ${className ?? ''}`.trim()}
      >
        No data
      </div>
    );
  }

  const formatYAxisLabel = yAxisLabelFormatter ?? ((value: number) => value.toLocaleString());

  const primarySeries = seriesList[0].series;

  // Allow parent container (aspect-ratio wrapper) to control sizing so the chart fills the card.
  const containerStyle: React.CSSProperties = {
    width: '100%',
    height: '100%',
    background: backgroundFill,
  };

  return (
    <div style={containerStyle} className={className} role="img" aria-label={ariaLabel}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: 6, left: 6, bottom: 4 }}>
          <CartesianGrid stroke="transparent" />
          <XAxis
            dataKey="timestamp"
            type="number"
            domain={[primarySeries.firstTimestamp, primarySeries.lastTimestamp]}
            axisLine={false}
            tickLine={false}
            hide={!showXAxisLabels}
            // show 2-3 readable ticks: start, mid, end (mid omitted if equal to start/end)
            ticks={(() => {
              const first = primarySeries.firstTimestamp;
              const last = primarySeries.lastTimestamp;
              if (first === last) return [first];
              const mid = Math.round((first + last) / 2);
              const out = [first];
              if (mid !== first && mid !== last) out.push(mid);
              out.push(last);
              return out;
            })()}
            tickFormatter={(value: number) => {
              if (xAxisLabelFormatter) return xAxisLabelFormatter(Number(value));
              // Choose a compact format based on total span
              const first = primarySeries.firstTimestamp;
              const last = primarySeries.lastTimestamp;
              const span = last - first;
              let fmt: Intl.DateTimeFormat;
              if (span > 7 * 24 * 60 * 60 * 1000) {
                fmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
              } else if (span > 24 * 60 * 60 * 1000) {
                fmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
              } else {
                fmt = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });
              }
              return fmt.format(new Date(Number(value)));
            }}
            tick={{ fill: xAxisLabelColor, fontSize: Math.max(10, xAxisLabelFontSize) }}
          />
          <YAxis
            hide={!showYAxisLabels}
            domain={[primarySeries.minValue, primarySeries.maxValue]}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => (showYAxisLabels ? formatYAxisLabel(Number(v)) : '')}
            width={showYAxisLabels ? 40 : 0}
          />

          <Tooltip
            labelFormatter={(label) => new Date(Number(label)).toLocaleString()}
            formatter={(value: any, name: string) => [value, name.replace(/^s_/, '')]}
          />

          {showTopGuide && (
            <ReferenceLine
              y={primarySeries.maxValue}
              stroke={topGuideColor}
              strokeDasharray={topGuideDasharray}
            />
          )}

          {showBaseline && (
            <ReferenceLine y={primarySeries.minValue} stroke={baselineColor} strokeWidth={1} />
          )}

          {seriesList.map((config) => {
            const key = `s_${config.id}`;
            return (
              <Line
                key={config.id}
                type="monotone"
                dataKey={key}
                stroke={config.color}
                strokeWidth={config.strokeWidth ?? 2}
                strokeDasharray={config.strokeDasharray}
                dot={config.showDots ? { r: config.dotRadius ?? 3, stroke: config.color, strokeWidth: 1 } : false}
                isAnimationActive={false}
                connectNulls
              >
              </Line>
            );
          })}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export default SparklineChart;
