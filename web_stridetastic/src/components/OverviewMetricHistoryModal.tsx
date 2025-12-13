'use client';

import React, { useMemo, useEffect, useCallback } from 'react';
import { X } from 'lucide-react';
import type { OverviewMetricSnapshot } from '@/types';
import { computeSparklineSeries } from '@/lib/charts/sparkline';
import type { SparklineSeries } from '@/lib/charts/sparkline';
import SparklineChart from './SparklineChart';
import { BRAND_PRIMARY } from '@/lib/brandColors';

export type MetricKey =
  | 'totalNodes'
  | 'activeNodes'
  | 'reachableNodes'
  | 'activeConnections'
  | 'channels'
  | 'avgBattery'
  | 'avgRSSI'
  | 'avgSNR';

interface MetricChartData {
  primary: SparklineSeries | null;
  startTimestamp: number | null;
  endTimestamp: number | null;
  latestValue: number | null;
  previousValue: number | null;
}

interface OverviewMetricHistoryModalProps {
  metricKey: MetricKey | null;
  isOpen: boolean;
  onClose: () => void;
  history: OverviewMetricSnapshot[];
  currentMetrics: {
    totalNodes: number;
    activeNodes: number;
    reachableNodes: number;
    activeConnections: number;
    channels: number;
    avgBattery: number | null;
    avgRSSI: number | null;
    avgSNR: number | null;
  };
}

const chartOptions = {
  width: 640,
  height: 280,
  leftPadding: 48,
  rightPadding: 32,
  topPadding: 32,
  bottomPadding: 56,
};
const chartAspectRatio = chartOptions.width / chartOptions.height;

const timeFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

const METRIC_CONFIG: Record<MetricKey, { label: string; unit?: string; fractionDigits?: number }> = {
  totalNodes: { label: 'Total Nodes' },
  activeNodes: { label: 'Active Nodes' },
  reachableNodes: { label: 'Reachable Nodes' },
  activeConnections: { label: 'Active Connections' },
  channels: { label: 'Channels' },
  avgBattery: { label: 'Average Battery', unit: '%', fractionDigits: 1 },
  avgRSSI: { label: 'Average RSSI', unit: 'dBm', fractionDigits: 1 },
  avgSNR: { label: 'Average SNR', unit: 'dB', fractionDigits: 1 },
};

const PRIMARY_COLOR = BRAND_PRIMARY;

function formatMetricValue(metricKey: MetricKey, value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return 'N/A';
  }

  const config = METRIC_CONFIG[metricKey];
  const formatted = value.toLocaleString(undefined, {
    minimumFractionDigits: config.fractionDigits ?? 0,
    maximumFractionDigits: config.fractionDigits ?? 0,
  });

  return config.unit ? `${formatted} ${config.unit}` : formatted;
}

function formatCountLabel(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return 'N/A';
  }
  return value.toLocaleString();
}

function selectMetricValue(snapshot: OverviewMetricSnapshot, metricKey: MetricKey): number | null | undefined {
  switch (metricKey) {
    case 'totalNodes':
      return snapshot.total_nodes;
    case 'activeNodes':
      return snapshot.active_nodes;
    case 'reachableNodes':
      return snapshot.reachable_nodes;
    case 'activeConnections':
      return snapshot.active_connections;
    case 'channels':
      return snapshot.channels;
    case 'avgBattery':
      return snapshot.avg_battery ?? null;
    case 'avgRSSI':
      return snapshot.avg_rssi ?? null;
    case 'avgSNR':
      return snapshot.avg_snr ?? null;
    default:
      return null;
  }
}

export function OverviewMetricHistoryModal({
  metricKey,
  isOpen,
  onClose,
  history,
  currentMetrics,
}: OverviewMetricHistoryModalProps): React.JSX.Element | null {
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handler);
    return () => {
      window.removeEventListener('keydown', handler);
    };
  }, [isOpen, onClose]);

  const chartData = useMemo<MetricChartData>(() => {
    if (!metricKey || !history.length) {
      return {
        primary: null,
        secondary: null,
        tertiary: null,
        startTimestamp: null,
        endTimestamp: null,
        latestValue: null,
        previousValue: null,
      };
    }

    const primaryPoints = history
      .map((snapshot) => {
        const value = selectMetricValue(snapshot, metricKey);
        if (value === null || value === undefined) {
          return null;
        }
        return {
          timestamp: snapshot.timestamp,
          value: Number(value),
        };
      })
      .filter((point): point is { timestamp: string; value: number } => Boolean(point));

    if (!primaryPoints.length) {
      return {
        primary: null,
        secondary: null,
        tertiary: null,
        startTimestamp: null,
        endTimestamp: null,
        latestValue: null,
        previousValue: null,
      };
    }
    const primarySeries = computeSparklineSeries(primaryPoints, chartOptions);
    if (!primarySeries) {
      return {
        primary: null,
        startTimestamp: null,
        endTimestamp: null,
        latestValue: null,
        previousValue: null,
      };
    }

    const previousValue = primarySeries && primarySeries.points.length > 1
      ? primarySeries.points[primarySeries.points.length - 2].value
      : null;

    return {
      primary: primarySeries,
      startTimestamp: primarySeries?.firstTimestamp ?? null,
      endTimestamp: primarySeries?.lastTimestamp ?? null,
      latestValue: primarySeries?.latestValue ?? null,
      previousValue,
    };
  }, [history, metricKey]);

  const handleDialogClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    event.stopPropagation();
  }, []);

  if (!isOpen || !metricKey) {
    return null;
  }

  const currentValue = (() => {
    switch (metricKey) {
      case 'totalNodes':
        return currentMetrics.totalNodes;
      case 'activeNodes':
        return currentMetrics.activeNodes;
      case 'reachableNodes':
        return currentMetrics.reachableNodes;
      case 'activeConnections':
        return currentMetrics.activeConnections;
      case 'channels':
        return currentMetrics.channels;
      case 'avgBattery':
        return currentMetrics.avgBattery;
      case 'avgRSSI':
        return currentMetrics.avgRSSI;
      case 'avgSNR':
        return currentMetrics.avgSNR;
      default:
        return null;
    }
  })();

  const delta = currentValue !== null && currentValue !== undefined && chartData.previousValue !== null && chartData.previousValue !== undefined
    ? currentValue - chartData.previousValue
    : null;

  const deltaLabel = delta !== null
    ? `${delta > 0 ? '+' : ''}${formatMetricValue(metricKey, delta)}`
    : '—';

  const config = METRIC_CONFIG[metricKey];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-gray-900/40" aria-hidden="true" />
      <div
        className="relative z-10 w-full max-w-3xl rounded-lg bg-white shadow-xl max-h-[90vh] overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby="metric-history-title"
        onClick={handleDialogClick}
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4 sm:px-6">
          <div>
            <h3 id="metric-history-title" className="text-lg font-semibold text-gray-900">
              {config.label} History
            </h3>
            <p className="text-sm text-gray-500">
              {chartData.startTimestamp && chartData.endTimestamp
                ? `${timeFormatter.format(new Date(chartData.startTimestamp))} – ${timeFormatter.format(new Date(chartData.endTimestamp))}`
                : 'Awaiting historical data'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-md border border-transparent text-gray-400 hover:border-gray-200 hover:text-gray-600"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-5 py-4 sm:px-6 sm:py-5 space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-500">Current value</p>
              <p className="text-xl font-semibold text-gray-900">
                {formatMetricValue(metricKey, currentValue)}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-500">Change since last snapshot</p>
              <p className={`text-xl font-semibold ${delta !== null ? (delta > 0 ? 'text-green-600' : delta < 0 ? 'text-red-600' : 'text-gray-900') : 'text-gray-500'}`}>
                {deltaLabel}
              </p>
            </div>
            {metricKey === 'totalNodes' && (
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-500">Reachable now</p>
                <p className="text-xl font-semibold text-gray-900">{formatCountLabel(currentMetrics.reachableNodes)}</p>
                <p className="text-xs text-gray-500 mt-1">Active nodes: {formatCountLabel(currentMetrics.activeNodes)}</p>
              </div>
            )}
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            {chartData.primary ? (
              <div className="space-y-3">
                <div
                  className="w-full"
                  style={{ aspectRatio: chartAspectRatio }}
                >
                  <SparklineChart
                    width={chartOptions.width}
                    height={chartOptions.height}
                    className="h-full w-full"
                    ariaLabel={`${config.label} history trend`}
                    backgroundFill="#f8fafc"
                    showBaseline
                    showTopGuide
                    topGuideColor="#e5e7eb"
                    showYAxisLabels
                    yAxisLabelFormatter={(value) => formatMetricValue(metricKey, value)}
                    seriesList={[
                      {
                        id: 'primary-metric',
                        series: chartData.primary,
                        color: PRIMARY_COLOR,
                        showArea: true,
                        areaOpacity: 0.25,
                        formatTooltip: (point) => {
                          return `${timeFormatter.format(new Date(point.timestamp))}: ${formatMetricValue(metricKey, point.value)}`;
                        },
                      },
                    ]}
                  />
                </div>
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>{chartData.startTimestamp ? timeFormatter.format(new Date(chartData.startTimestamp)) : '—'}</span>
                  <span>{chartData.endTimestamp ? timeFormatter.format(new Date(chartData.endTimestamp)) : '—'}</span>
                </div>
                <div className="flex flex-wrap items-center gap-4 text-xs text-gray-600">
                  <span className="inline-flex items-center gap-2">
                    <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: PRIMARY_COLOR }} />
                    {config.label}
                  </span>
                </div>
                {chartData.primary && (
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span>
                      Min {formatMetricValue(metricKey, chartData.primary.minValue)}
                    </span>
                    <span>
                      Max {formatMetricValue(metricKey, chartData.primary.maxValue)}
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <div
                className="flex w-full items-center justify-center text-sm text-gray-500"
                style={{ aspectRatio: chartAspectRatio }}
              >
                No historical data available yet for this metric.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default OverviewMetricHistoryModal;
