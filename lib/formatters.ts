// Shared formatting helpers. Extracted from components/BusinessSheet.tsx so
// new surfaces (RedemptionModal, posts feed, etc.) can reuse without
// duplicating. BusinessSheet's local copy left in place to avoid a risky
// refactor mid-feature; consolidate in a housekeeping pass later.

/**
 * Returns a human-readable relative-time string for an ISO date string.
 * Examples: "just now", "5m ago", "3h ago", "2d ago", "4w ago".
 */
export function formatTimeAgo(dateString: string): string {
  const seconds = Math.floor(
    (Date.now() - new Date(dateString).getTime()) / 1000
  );
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  return `${weeks}w ago`;
}

/**
 * Returns a localized HH:MM:SS string for the given Date.
 * Used in RedemptionModal as the live freshness clock.
 */
export function formatLiveClock(d: Date): string {
  return d.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  });
}
