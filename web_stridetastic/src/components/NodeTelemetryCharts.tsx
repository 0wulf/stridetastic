'use client';

import React, { useMemo } from 'react';
import type { NodeTelemetryHistoryEntry } from '@/types';
import type { ActivityTimeRange } from '@/lib/activityFilters';
import { getActivityTimeRanges } from '@/lib/activityFilters';
import { computeSparklineSeries } from '@/lib/charts/sparkline';
import type { SparklineSeries } from '@/lib/charts/sparkline';
import SparklineChart from './SparklineChart';
import { BRAND_PRIMARY } from '@/lib/brandColors';

interface NodeTelemetryChartsProps {
  data: NodeTelemetryHistoryEntry[];
  isLoading: boolean;
  error: string | null;
  selectedRange: ActivityTimeRange;
  onRangeChange: (range: ActivityTimeRange) => void;
}

interface SeriesDefinition {
  key: keyof NodeTelemetryHistoryEntry;
  label: string;
  unit?: string;
  decimals?: number;
  color: string;
  formatter?: (value: number) => string;
}

const SERIES: SeriesDefinition[] = [
  { key: 'battery_level', label: 'Battery Level', unit: '%', decimals: 0, color: BRAND_PRIMARY },
  { key: 'voltage', label: 'Voltage', unit: 'V', decimals: 2, color: '#f97316' },
  { key: 'temperature', label: 'Temperature', unit: '°C', decimals: 1, color: '#ef4444' },
  { key: 'relative_humidity', label: 'Humidity', unit: '%', decimals: 1, color: '#22c55e' },
  { key: 'barometric_pressure', label: 'Pressure', unit: 'hPa', decimals: 1, color: '#6366f1' },
  { key: 'air_util_tx', label: 'Air Util TX', unit: '%', decimals: 1, color: '#8b5cf6' },
  { key: 'channel_utilization', label: 'Channel Util', unit: '%', decimals: 1, color: '#facc15' },
  { key: 'iaq', label: 'IAQ', decimals: 0, color: '#14b8a6' },
  { key: 'gas_resistance', label: 'Gas Resistance', unit: 'Ω', decimals: 0, color: '#a855f7' },
  {
    key: 'uptime_seconds',
    label: 'Uptime',
    unit: 's',
    decimals: 0,
    color: '#475569',
    formatter: (value) => formatDuration(value),
  },
];

const timeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: '2-digit',
  minute: '2-digit',
});

function formatValue(value: number, decimals = 0, unit?: string, formatter?: (value: number) => string): string {
  if (formatter) {
    return formatter(value);
  }
  const rounded = decimals > 0 ? value.toFixed(decimals) : Math.round(value).toString();
  return unit ? `${rounded}${unit}` : rounded;
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return '0s';
  }
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) {
    return `${days}d ${hours}h`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m`;
  }
  return `${Math.floor(seconds)}s`;
}

interface TelemetrySeries {
  definition: SeriesDefinition;
  sparkline: SparklineSeries;
}

const sparklineDimensions = {
  width: 100,
  height: 40,
  topPadding: 4,
  bottomPadding: 6,
};
const sparklineAspectRatio = sparklineDimensions.width / sparklineDimensions.height;

export default function NodeTelemetryCharts({
  data,
  isLoading,
  error,
  selectedRange,
  onRangeChange,
}: NodeTelemetryChartsProps) {
  const processedSeries = useMemo<TelemetrySeries[]>(() => {
    return SERIES.map((definition) => {
      const inputPoints = data
        .map((entry) => {
          const rawValue = entry[definition.key];
          if (rawValue === null || rawValue === undefined) {
            return null;
          }
          const numericValue = typeof rawValue === 'number' ? rawValue : Number(rawValue);
          if (!Number.isFinite(numericValue)) {
            return null;
          }
          return {
            timestamp: entry.timestamp,
            value: numericValue,
          };
        })
        .filter((point): point is { timestamp: string; value: number } => Boolean(point));

      if (!inputPoints.length) {
        return null;
      }

      const sparkline = computeSparklineSeries(inputPoints, sparklineDimensions);
      if (!sparkline) {
        return null;
      }

      return {
        definition,
        sparkline,
      } satisfies TelemetrySeries;
    }).filter((series): series is TelemetrySeries => Boolean(series));
  }, [data]);

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
        <h3 className="text-base sm:text-lg font-semibold text-gray-900">Telemetry Trends</h3>
        <div className="flex items-center gap-2">
          <label htmlFor="telemetry-range" className="text-xs uppercase tracking-wide text-gray-500">
            Range
          </label>
          <select
            id="telemetry-range"
            value={selectedRange}
            onChange={(event) => onRangeChange(event.target.value as ActivityTimeRange)}
            className="text-sm border border-gray-300 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {getActivityTimeRanges().map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className="flex h-32 items-center justify-center rounded-lg border border-dashed border-gray-300 text-sm text-gray-500">
          Loading telemetry history…
        </div>
      ) : error ? (
        <div className="flex h-32 items-center justify-center rounded-lg border border-dashed border-red-300 bg-red-50 text-sm text-red-600">
          {error}
        </div>
      ) : processedSeries.length === 0 ? (
        <p className="text-sm text-gray-500">No telemetry data available for the selected range.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {processedSeries.map(({ definition, sparkline }) => {
            const startLabel = timeFormatter.format(new Date(sparkline.firstTimestamp));
            const endLabel = timeFormatter.format(new Date(sparkline.lastTimestamp));

            return (
              <div key={definition.key as string} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                <div className="flex items-baseline justify-between">
                  <h4 className="text-sm font-semibold text-gray-900">{definition.label}</h4>
                  <span className="text-sm font-medium text-gray-700">
                    {formatValue(
                      sparkline.latestValue,
                      definition.decimals,
                      definition.unit,
                      definition.formatter,
                    )}
                  </span>
                </div>
                <div
                  className="w-full"
                  style={{ aspectRatio: sparklineAspectRatio }}
                >
                  <SparklineChart
                    width={sparklineDimensions.width}
                    height={sparklineDimensions.height}
                    className="h-full w-full"
                    ariaLabel={`${definition.label} telemetry trend`}
                    seriesList={[{
                      id: String(definition.key),
                      series: sparkline,
                      color: definition.color,
                      showArea: true,
                      areaOpacity: 0.35,
                      formatTooltip: (point) => {
                        const formattedValue = formatValue(
                          point.value,
                          definition.decimals,
                          definition.unit,
                          definition.formatter,
                        );
                        const formattedTime = timeFormatter.format(new Date(point.timestamp));
                        return `${formattedTime}: ${formattedValue}`;
                      },
                    }]}
                  />
                </div>
                <div className="mt-2 flex items-center justify-between text-xs text-gray-500">
                  <span>{startLabel}</span>
                  <span>{endLabel}</span>
                </div>
                <div className="mt-1 flex items-center justify-between text-[11px] text-gray-400">
                  <span>
                    Min {formatValue(sparkline.minValue, definition.decimals, definition.unit, definition.formatter)}
                  </span>
                  <span>
                    Max {formatValue(sparkline.maxValue, definition.decimals, definition.unit, definition.formatter)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
