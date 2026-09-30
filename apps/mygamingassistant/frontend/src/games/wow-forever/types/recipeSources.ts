import type { Faction } from "@/games/wow-forever/types/worldMap";

/** A vendor who sells it, placed on the World Map. */
export interface VendorSpot {
  npcId: number;
  name: string;
  /** "Master of Cooking Recipes". */
  title: string;
  zoneId: number;
  zoneName: string;
  subzone: string;
  x: number;
  y: number;
  /** Who can buy from them ("N" = both factions). */
  faction: Faction;
  /** Limited stock — it sells out and comes back later. */
  limited: boolean;
}

/** Where on the World Map a mob is found. */
export interface MobSpot {
  zoneId: number;
  zoneName: string;
  subzone: string;
  x: number;
  y: number;
}

export interface DropMob {
  name: string;
  minLevel: number;
  maxLevel: number;
  /** Percent chance per kill. */
  chance: number;
  /** Its biggest pack, in the zone it's most common in. */
  spot: MobSpot | null;
}

export interface DropSource {
  /** Drops from many mobs' shared loot — no one mob to farm. */
  world: boolean;
  levels: [number, number];
  /** The best mobs to farm (chance x how many there are). Empty for a world drop. */
  mobs: DropMob[];
  /** How many other mobs drop it. */
  more: number;
  /** Where the drops are, best first. */
  zones: string[];
}

export interface QuestGiver {
  kind: "npc" | "object";
  name: string;
  zoneId: number;
  zoneName: string;
  subzone: string;
  x: number;
  y: number;
}

export interface QuestSource {
  id: number;
  title: string;
  level: number;
  /** "A" / "H" = one faction only; "N" = both. */
  side: Faction;
  givers: QuestGiver[];
}

/** Everything known about where an item comes from. Empty lists = not a source. */
export interface ItemSources {
  vendors: VendorSpot[];
  quests: QuestSource[];
  drop: DropSource | null;
  fishing: string[];
  containers: string[];
}
