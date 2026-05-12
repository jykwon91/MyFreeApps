/** Utility functions for classifier confidence display. */

export function confidenceBorderClass(conf: number | null): string {
  if (conf === null) return "border-border";
  if (conf >= 0.75) return "border-green-500/60";
  if (conf >= 0.5) return "border-yellow-500/60";
  return "border-red-500/60";
}
