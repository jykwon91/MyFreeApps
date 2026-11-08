/** "1 point" / "5 points". */
export function formatPoints(n: number): string {
  return n === 1 ? "1 point" : `${n} points`;
}
