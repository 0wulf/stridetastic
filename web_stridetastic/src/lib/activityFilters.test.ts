import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { isWithinTimeRange } from './activityFilters';

describe('activityFilters.isWithinTimeRange', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-13T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns true for all', () => {
    expect(isWithinTimeRange('2000-01-01T00:00:00.000Z', 'all')).toBe(true);
  });

  it('handles boundary conditions', () => {
    expect(isWithinTimeRange('2026-01-13T11:55:00.000Z', '5min')).toBe(true);
    expect(isWithinTimeRange('2026-01-13T11:54:59.999Z', '5min')).toBe(false);

    expect(isWithinTimeRange('2026-01-13T11:00:00.000Z', '1hour')).toBe(true);
    expect(isWithinTimeRange('2026-01-13T10:59:59.999Z', '1hour')).toBe(false);
  });
});
