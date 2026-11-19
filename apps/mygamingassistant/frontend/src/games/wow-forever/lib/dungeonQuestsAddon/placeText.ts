/** "Westfall 56.3, 47.5 (Sentinel Hill)": a spot as MGA Dungeon Quests prints it. */
export function placeText(zoneName: string, subzone: string | null, x: number, y: number): string {
  const spot = `${zoneName} ${x.toFixed(1)}, ${y.toFixed(1)}`;
  return subzone && subzone !== zoneName ? `${spot} (${subzone})` : spot;
}
