/** "16" when both ends match, else "10–20". */
export function levelRange(min: number, max: number): string {
  return min === max ? String(min) : `${min}–${max}`;
}
