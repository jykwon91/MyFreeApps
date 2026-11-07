import type { BossLootItem } from "@/games/wow-forever/types/dungeons/bossLootItem";

/** A boss, in the Forever client's encounter order. */
export interface DungeonBoss {
  /** The Forever client's DungeonEncounter id. */
  encounter: number;
  name: string;
  /** Unique within its dungeon: the page anchor is `#boss-<slug>`. */
  slug: string;
  /**
   * What it drops, most likely first. Null when our loot data has no creature
   * for this encounter (a chest, an event); empty when none of its Classic loot
   * is in the Forever client.
   */
  loot: readonly BossLootItem[] | null;
}
