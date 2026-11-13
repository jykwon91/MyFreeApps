const MS_PER_MINUTE = 60_000;

/** Milliseconds until a "Refresh now" works again; 0 when it already does. */
export function cooldownLeftMs(availableAt: string | null, nowMs: number): number {
  if (availableAt === null) return 0;
  return Math.max(new Date(availableAt).getTime() - nowMs, 0);
}

/** Whole minutes to show for a wait, rounded up (never "0 minutes"). */
export function cooldownMinutes(ms: number): number {
  return Math.max(Math.ceil(ms / MS_PER_MINUTE), 1);
}
