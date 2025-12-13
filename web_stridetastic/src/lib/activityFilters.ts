/**
 * Activity filtering utilities for network data
 */

export type ActivityTimeRange = 'all' | '5min' | '1hour' | '2hours' | '24hours' | '7days';

export interface ActivityFilterOptions {
  activityFilter: ActivityTimeRange;
}

/**
 * Get minutes ago from a date string
 */
export function getMinutesAgo(dateString: string): number {
  const now = new Date();
  const date = new Date(dateString);
  return (now.getTime() - date.getTime()) / (1000 * 60);
}

/**
 * Check if a timestamp is within the specified time range
 */
export function isWithinTimeRange(dateString: string, timeRange: ActivityTimeRange): boolean {
  if (timeRange === 'all') return true;
  
  const minutesAgo = getMinutesAgo(dateString);
  
  switch (timeRange) {
    case '5min':
      return minutesAgo <= 5;
    case '1hour':
      return minutesAgo <= 60;
    case '2hours':
      return minutesAgo <= 120;
    case '24hours':
      return minutesAgo <= 1440; // 24 * 60
    case '7days':
      return minutesAgo <= 10080; // 7 * 24 * 60
    default:
      return true;
  }
}

/**
 * Get display label for time range
 */
export function getTimeRangeLabel(timeRange: ActivityTimeRange): string {
  switch (timeRange) {
    case 'all':
      return 'All Time';
    case '5min':
      return 'Last 5 minutes';
    case '1hour':
      return 'Last hour';
    case '2hours':
      return 'Last 2 hours';
    case '24hours':
      return 'Last 24 hours';
    case '7days':
      return 'Last 7 days';
    default:
      return 'All Time';
  }
}

/**
 * Get activity time ranges in order
 */
export function getActivityTimeRanges(): { value: ActivityTimeRange; label: string }[] {
  return [
    { value: 'all', label: 'All Time' },
    { value: '5min', label: 'Last 5 minutes' },
    { value: '1hour', label: 'Last hour' },
    { value: '2hours', label: 'Last 2 hours' },
    { value: '24hours', label: 'Last 24 hours' },
    { value: '7days', label: 'Last 7 days' },
  ];
}
