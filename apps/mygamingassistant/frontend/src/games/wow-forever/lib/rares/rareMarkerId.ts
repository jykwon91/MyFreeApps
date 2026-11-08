const PREFIX = "rare:";

/** A rare spawn's World Map marker id: `rare:<creature id>:<spawn index>`. */
export function rareMarkerId(rareId: number, spawnIndex: number): string {
  return `${PREFIX}${rareId}:${spawnIndex}`;
}

/** The creature id in a rare marker's id, or null for any other marker. */
export function rareIdOfMarker(markerId: string | null): number | null {
  if (!markerId?.startsWith(PREFIX)) return null;
  const match = /^rare:(\d+):\d+$/.exec(markerId);
  return match ? Number(match[1]) : null;
}
