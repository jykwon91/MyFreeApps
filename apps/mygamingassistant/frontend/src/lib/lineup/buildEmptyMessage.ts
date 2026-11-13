/** Empty-state copy for a lineup board, reflecting the active side/util filters. */
export function buildEmptyMessage(mapName: string, side: string, filteredUtils: string[]): string {
  const sideLabel = side === "side_a" ? "T" : side === "side_b" ? "CT" : null;
  const utilLabel = filteredUtils.length > 0 ? filteredUtils.join(", ") : null;
  if (!sideLabel && !utilLabel) return `No lineups on ${mapName} yet.`;
  const parts: string[] = [];
  if (utilLabel) parts.push(utilLabel);
  if (sideLabel) parts.push(sideLabel);
  return `No ${parts.join(" ")} lineups on this map.`;
}
