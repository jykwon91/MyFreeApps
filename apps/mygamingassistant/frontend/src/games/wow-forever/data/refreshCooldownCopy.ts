/** A "Refresh now" was asked for too recently, whether by a click, the scheduled refresh or a failed try. */
export function refreshCooldownCopy(minutes: number): string {
  return `Refreshed recently — you can refresh again in ${minutes} ${minutes === 1 ? "minute" : "minutes"}.`;
}
