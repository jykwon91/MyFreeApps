/**
 * How a zone reads to THIS player — the colour the game gives a zone name
 * (friendly green, hostile red, contested yellow) and the hover line's
 * "Level 10–20 · Alliance territory".
 */
import {
  FACTION,
  TERRITORY,
  type MapView,
  type PlayerFaction,
  type Territory,
} from "@/games/wow-forever/types/worldMap";

export const ZONE_RELATION = {
  friendly: "friendly",
  hostile: "hostile",
  contested: "contested",
  /** Continents, the world map and new Forever zones: no claim either way. */
  unknown: "unknown",
} as const;
export type ZoneRelation = (typeof ZONE_RELATION)[keyof typeof ZONE_RELATION];

const OWNER: Record<Territory, PlayerFaction | null> = {
  [TERRITORY.alliance]: FACTION.alliance,
  [TERRITORY.horde]: FACTION.horde,
  [TERRITORY.contested]: null,
};

const TERRITORY_LABEL: Record<Territory, string> = {
  [TERRITORY.alliance]: "Alliance territory",
  [TERRITORY.horde]: "Horde territory",
  [TERRITORY.contested]: "Contested",
};

export function zoneRelation(map: MapView, faction: PlayerFaction): ZoneRelation {
  const zone = map.zone;
  if (!zone) return ZONE_RELATION.unknown;
  if (zone.faction === FACTION.alliance || zone.faction === FACTION.horde) {
    return zone.faction === faction ? ZONE_RELATION.friendly : ZONE_RELATION.hostile;
  }
  if (!zone.territory) return ZONE_RELATION.unknown;
  const owner = OWNER[zone.territory];
  if (owner === null) return ZONE_RELATION.contested;
  return owner === faction ? ZONE_RELATION.friendly : ZONE_RELATION.hostile;
}

/** "Level 5–10 · Alliance territory", or "" when the client says neither. */
export function zoneFacts(map: MapView): string {
  const facts: string[] = [];
  const zone = map.zone;
  if (zone?.levels) facts.push(`Level ${zone.levels[0]}–${zone.levels[1]}`);
  if (zone?.territory) facts.push(TERRITORY_LABEL[zone.territory]);
  if (zone?.foreverOnly) facts.push("New in Forever");
  return facts.join(" · ");
}

/** Tailwind classes tinting a hover highlight by relation. */
export const RELATION_TINT: Record<ZoneRelation, string> = {
  [ZONE_RELATION.friendly]: "bg-green-400",
  [ZONE_RELATION.hostile]: "bg-red-500",
  [ZONE_RELATION.contested]: "bg-amber-300",
  [ZONE_RELATION.unknown]: "bg-white",
};

/** Text colour of a zone name, by relation. */
export const RELATION_TEXT: Record<ZoneRelation, string> = {
  [ZONE_RELATION.friendly]: "text-green-600 dark:text-green-400",
  [ZONE_RELATION.hostile]: "text-red-600 dark:text-red-400",
  [ZONE_RELATION.contested]: "text-amber-600 dark:text-amber-300",
  [ZONE_RELATION.unknown]: "text-foreground",
};

/** Tailwind outline classes for maps with no highlight art (cities, islands). */
export const RELATION_OUTLINE: Record<ZoneRelation, string> = {
  [ZONE_RELATION.friendly]: "border-green-400 bg-green-400/20",
  [ZONE_RELATION.hostile]: "border-red-500 bg-red-500/20",
  [ZONE_RELATION.contested]: "border-amber-300 bg-amber-300/20",
  [ZONE_RELATION.unknown]: "border-white bg-white/20",
};
