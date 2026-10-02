import type { Faction, Territory } from "@/games/wow-forever/types/worldMap";

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
  /** How many a limited vendor holds at once, shared by every player on the realm (0 = unlimited). */
  stock: number;
  /** Classic restock time, in minutes (0 = unlimited). */
  restockMinutes: number;
}

/** Where on the World Map a mob is found. */
export interface MobSpot {
  zoneId: number;
  zoneName: string;
  subzone: string;
  x: number;
  y: number;
  /** Whose ground the zone is (null when the client doesn't say). */
  territory: Territory | null;
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

/** Leather and hides: skinned from beasts. */
export interface SkinningSource {
  levels: [number, number];
  /** Where the most of them are, best first. */
  zones: string[];
}

export const DISENCHANT_FROM = { weapon: "weapon", armor: "armor" } as const;
export type DisenchantFrom = (typeof DISENCHANT_FROM)[keyof typeof DISENCHANT_FROM];

/** Dusts, essences and shards: what to disenchant for them. */
export interface DisenchantSource {
  /** "Requires level" band of the green items that can give it. */
  minLevel: number;
  maxLevel: number;
  /** Best percent per disenchant of a green item. */
  chance: number;
  /** Green weapons (with shields and off-hands) or worn armour give it most; null = both. */
  mostlyFrom: DisenchantFrom | null;
  /** Blue items give it (shards — every time). */
  fromBlue: boolean;
}

/** Everything known about where an item comes from. Empty lists / null = not a source. */
export interface ItemSources {
  vendors: VendorSpot[];
  quests: QuestSource[];
  drop: DropSource | null;
  skinning: SkinningSource | null;
  disenchant: DisenchantSource | null;
  fishing: string[];
  containers: string[];
}
