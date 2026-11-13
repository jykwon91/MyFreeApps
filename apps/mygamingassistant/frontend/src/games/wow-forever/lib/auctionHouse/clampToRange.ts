/** `value` rounded to `decimals` places and kept within [lowest, highest]; empty stays empty. Pure. */
export function clampToRange(value: number | null, lowest: number, highest: number, decimals: number): number | null {
  if (value === null) return null;
  const scale = 10 ** decimals;
  const rounded = Math.round(value * scale) / scale;
  return Math.min(Math.max(rounded, lowest), highest);
}
