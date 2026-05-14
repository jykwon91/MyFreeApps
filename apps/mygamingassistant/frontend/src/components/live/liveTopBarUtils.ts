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

/**
 * Display-format a zone slug. `null`/empty → null (caller hides the
 * segment). Same shape as `formatZoneDisplay` in `lib/cv.ts` — duplicated
 * here so the LiveTopBar component file doesn't pull from `lib/`. Keeps
 * the presentational tree shallow.
 */
export function formatZone(slug: string | null | undefined): string | null {
  if (!slug) return null;
  return slug.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Tailwind classes for the round-phase chip on the HUD bar.
 *
 * PR 10's design: freezetime=blue (cool, preparation), live=green (go),
 * over=grey (resolved). The colors are paired with text so the chip
 * communicates the round phase by both color AND text (a11y safe).
 *
 * Accepts the display string ("Freezetime", "Live", "Over") rather than
 * the raw slug because that's what the caller already has computed.
 */
export function roundPhaseChipClasses(display: string): string {
  switch (display) {
    case "Freezetime":
      return "bg-sky-500/15 text-sky-700 dark:text-sky-300";
    case "Live":
      return "bg-green-500/15 text-green-700 dark:text-green-300";
    case "Over":
      return "bg-muted/60 text-muted-foreground";
    default:
      return "bg-muted/40 text-foreground";
  }
}
