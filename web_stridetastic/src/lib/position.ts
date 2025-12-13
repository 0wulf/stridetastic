const FRIENDLY_LABELS: Record<string, string> = {
  LOC_UNKNOWN: 'Unknown',
  LOC_INTERNAL: 'Internal GPS',
  LOC_EXTERNAL: 'External GPS',
  LOC_MANUAL: 'Manual Entry',
  LOC_REMOTE: 'Remote Device',
};

function capitalize(word: string): string {
  if (!word) {
    return word;
  }
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

/**
 * Convert a Meshtastic location_source enum value into a human readable label.
 */
export function formatLocationSourceLabel(source?: string | null): string {
  if (!source) {
    return 'Unknown';
  }

  const normalized = source.trim().toUpperCase();
  if (!normalized) {
    return 'Unknown';
  }

  if (FRIENDLY_LABELS[normalized]) {
    return FRIENDLY_LABELS[normalized];
  }

  const prefixed = `LOC_${normalized}`;
  if (FRIENDLY_LABELS[prefixed]) {
    return FRIENDLY_LABELS[prefixed];
  }

  const raw = normalized.startsWith('LOC_') ? normalized.slice(4) : normalized;
  const label = raw
    .split('_')
    .filter(Boolean)
    .map(capitalize)
    .join(' ');

  return label || 'Unknown';
}
