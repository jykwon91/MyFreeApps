import { RARE_CLASSIFICATION_LABEL } from "@/games/wow-forever/data/rares/raresConfig";
import type { Rare } from "@/games/wow-forever/types/rares/rare";
import type { RareSpawn } from "@/games/wow-forever/types/rares/rareSpawn";

/** "Level 25", "Level 24–26", or null when the level isn't known. */
export function rareLevelText(rare: Pick<Rare, "minLevel" | "maxLevel">): string | null {
  const { minLevel, maxLevel } = rare;
  if (minLevel === null || maxLevel === null) return null;
  return minLevel === maxLevel ? `Level ${minLevel}` : `Level ${minLevel}–${maxLevel}`;
}

/** The map marker's tooltip: "Morgaine the Sly — level 10 rare". */
export function rareMarkerLabel(rare: Rare): string {
  const kind = RARE_CLASSIFICATION_LABEL[rare.classification].toLowerCase();
  const level = rareLevelText(rare);
  return level ? `${rare.name} — ${level.toLowerCase()} ${kind}` : `${rare.name} — ${kind}`;
}

/** "Alther's Mill, Redridge Mountains", or just the zone out in the open. */
export function spawnPlaceText(spawn: RareSpawn): string {
  return spawn.subzone ? `${spawn.subzone}, ${spawn.zoneName}` : spawn.zoneName;
}

/** Where a rare is, for its row: "Forest's Edge, Elwynn Forest", "Redridge Mountains · 11 spots", "2 zones · 5 spots". */
export function rareWhereText(rare: Rare): string | null {
  const { spawns } = rare;
  if (spawns.length === 0) return null;
  const zones = new Set(spawns.map((s) => s.zoneId));
  const spots = spawns.length === 1 ? "" : ` · ${spawns.length} spots`;
  if (zones.size > 1) return `${zones.size} zones${spots}`;
  const places = new Set(spawns.map((s) => s.subzone));
  return places.size === 1 ? `${spawnPlaceText(spawns[0])}${spots}` : `${spawns[0].zoneName}${spots}`;
}
