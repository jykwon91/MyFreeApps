/** ``completed`` as a percentage of ``total``; 0 when there is nothing to count yet. */
export function progressPercent(completed: number, total: number): number {
  if (total <= 0) return 0;
  return (completed / total) * 100;
}
