'use client';

import React, { useMemo } from 'react';
import type { NodeLatencyHistoryEntry } from '@/types';
import { computeSparklineSeries } from '@/lib/charts/sparkline';
import SparklineChart from './SparklineChart';

interface NodeLatencyHistoryChartProps {
  data: NodeLatencyHistoryEntry[];
  isLoading: boolean;
  error: string | null;
  currentLatency: number | null | undefined;
  currentReachable: boolean | null | undefined;
}

const chartOptions = {
  width: 280,
  height: 100,
  topPadding: 16,
  bottomPadding: 28,
  leftPadding: 24,
  rightPadding: 12,
};
const chartAspectRatio = chartOptions.width / chartOptions.height;

const timeFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

function formatLatency(latencyMs: number | null | undefined): string {
  if (latencyMs === null || latencyMs === undefined) {
    return '—';
  }
  if (latencyMs >= 1000) {
    const seconds = latencyMs / 1000;
    if (seconds >= 60) {
      const minutes = seconds / 60;
      return `${minutes.toFixed(minutes >= 10 ? 0 : 1)} min`;
    }
    return `${seconds.toFixed(seconds >= 10 ? 0 : 1)} s`;
  }
  return `${latencyMs} ms`;
}

export function NodeLatencyHistoryChart({
  data,
  isLoading,
  error,
  currentLatency,
  currentReachable,
}: NodeLatencyHistoryChartProps): React.JSX.Element {
  const sparkline = useMemo(() => {
    const points = data
      .map((entry) => {
        if (entry.latency_ms === null || entry.latency_ms === undefined) {
          return null;
        }
        return {
          timestamp: entry.timestamp,
          value: entry.latency_ms,
        };
      })
      .filter((point): point is { timestamp: string; value: number } => Boolean(point));

    if (!points.length) {
      return null;
    }

    return computeSparklineSeries(points, chartOptions);
  }, [data]);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2">
        <div className="animate-pulse h-16 rounded-md bg-gray-100" />
        <div className="h-4 w-40 animate-pulse rounded bg-gray-100" />
      </div>
    );
  }

  if (error) {
    return <p className="text-sm text-red-600">{error}</p>;
  }

  if (!data.length) {
  return <p className="text-sm text-gray-500">No latency probes recorded for this node in the selected window.</p>;
  }

  const totalProbes = data.length;
  const reachableProbes = data.filter((entry) => entry.reachable === true).length;
  const latencyValues = data
    .filter((entry) => entry.latency_ms !== null && entry.latency_ms !== undefined)
    .map((entry) => entry.latency_ms as number);
  const averageLatency = latencyValues.length
    ? latencyValues.reduce((sum, value) => sum + value, 0) / latencyValues.length
    : null;
  const latestEntry = data[data.length - 1];
  const lastProbeTime = latestEntry ? timeFormatter.format(new Date(latestEntry.timestamp)) : null;
  const successRate = totalProbes > 0 ? (reachableProbes / totalProbes) * 100 : 0;

  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>{sparkline ? timeFormatter.format(new Date(sparkline.firstTimestamp)) : '—'}</span>
          <span>{sparkline ? timeFormatter.format(new Date(sparkline.lastTimestamp)) : '—'}</span>
        </div>
        {sparkline ? (
          <div
            className="w-full"
            style={{ aspectRatio: chartAspectRatio }}
          >
            <SparklineChart
              width={chartOptions.width}
              height={chartOptions.height}
              className="h-full w-full"
              ariaLabel="Latency history"
              backgroundFill="rgba(99, 102, 241, 0.05)"
              showBaseline
              showTopGuide
              showYAxisLabels
              yAxisLabelFormatter={(v) => formatLatency(Math.round(Number(v)))}
              yAxisLabelColor="#374151"
              topGuideColor="#e5e7eb"
              seriesList={[{
                id: 'latency',
                series: sparkline,
                color: '#6366f1',
                showArea: true,
                areaOpacity: 0.35,
                formatTooltip: (point) => `${timeFormatter.format(new Date(point.timestamp))}: ${formatLatency(Math.round(point.value))}`,
              }]}
            />
          </div>
        ) : (
          <div
            className="flex w-full items-center justify-center rounded border border-dashed border-gray-200 text-sm text-gray-500"
            style={{ aspectRatio: chartAspectRatio }}
          >
            No successful probes in range.
          </div>
        )}
      </div>
      <dl className="grid grid-cols-2 gap-3 text-xs text-gray-600 sm:grid-cols-4">
        <div>
          <dt className="font-medium text-gray-900">Latest probe</dt>
          <dd>{lastProbeTime ?? '—'}</dd>
        </div>
        <div>
          <dt className="font-medium text-gray-900">Current status</dt>
          <dd>
            {currentReachable === true && `Reachable ${formatLatency(currentLatency)}`}
            {currentReachable === false && 'Unreachable'}
            {currentReachable === null && 'No recent probe'}
          </dd>
        </div>
        <div>
          <dt className="font-medium text-gray-900">Average latency</dt>
          <dd>{averageLatency !== null ? formatLatency(Math.round(averageLatency)) : '—'}</dd>
        </div>
        <div>
          <dt className="font-medium text-gray-900">Success rate</dt>
          <dd>{totalProbes ? `${successRate.toFixed(successRate >= 99 ? 0 : 1)}% (${reachableProbes}/${totalProbes})` : '—'}</dd>
        </div>
      </dl>
    </div>
  );
}

export default NodeLatencyHistoryChart;
