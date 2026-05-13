/**
 * Helpers for `LiveTopBar` — extracted into a separate file to keep
 * fast-refresh happy (it only refreshes files that contain ONLY component
 * exports).
 *
 * Pure functions; easy to unit test.
 */

/**
 * Map the receiver's two booleans + payload count into a status label +
 * Tailwind text-color class.
 *
 * Order matters: not-ready dominates not-running dominates waiting dominates
 * connected.
 */
export function connectionStateFromProps(
  ready: boolean,
  running: boolean,
  payloadsReceived: number,
): { color: string; label: string } {
  if (!ready) return { color: "text-muted-foreground", label: "Initializing" };
  if (!running) return { color: "text-destructive", label: "Offline" };
  if (payloadsReceived === 0) return { color: "text-amber-500", label: "Waiting" };
  return { color: "text-green-500", label: "Connected" };
}

/**
 * Format an RFC3339 timestamp as relative "Xs ago" for the live header.
 *
 * @param rfc3339 The RFC3339 timestamp (UTC) to format.
 * @param now     Reference time for the relative calculation. Defaults to
 *                wall-clock time; tests pass a fixed `Date` for determinism.
 */
export function formatLastEventTime(rfc3339: string, now: Date = new Date()): string {
  const t = Date.parse(rfc3339);
  if (Number.isNaN(t)) return "—";
  const diffMs = now.getTime() - t;
  const secs = Math.max(0, Math.floor(diffMs / 1000));
  if (secs < 5) return "just now";
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ago`;
}
