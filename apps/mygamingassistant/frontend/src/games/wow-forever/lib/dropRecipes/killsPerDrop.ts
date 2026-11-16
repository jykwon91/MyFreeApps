/** "about 1 in 125 kills" for a percent per kill; empty when the chance is too small to quote. */
export function killsPerDrop(chance: number): string {
  if (chance <= 0) return "";
  const kills = Math.max(1, Math.round(100 / chance));
  return kills === 1 ? "nearly every kill" : `about 1 in ${kills.toLocaleString("en-US")} kills`;
}
