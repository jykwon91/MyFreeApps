import type { InteriorsFile } from "@/games/wow-forever/worldMap/interiors";

/**
 * The generated files a dungeon page is built from, as JSON: the World Map's
 * entrances and interiors, and the dungeon generator's loot and facts. Zones
 * and flight paths are decoded by the World Map's own decoders first
 * (`DungeonWorld`).
 */
export interface DungeonDataFiles {
  dungeons: { columns: string[]; rows: unknown[][] };
  interiors: InteriorsFile;
  bossLoot: { lootColumns: string[]; instances: Record<string, Record<string, unknown[][]>> };
  lootItems: { clientBuild: string; columns: string[]; items: Record<string, unknown[]> };
  facts: { maxPlayers: Record<string, number> };
  entry: { columns: string[]; instances: Record<string, unknown[][]> };
  quests: {
    questColumns: string[];
    giverColumns: string[];
    objectiveColumns: string[];
    targetColumns: string[];
    instances: Record<string, number[]>;
    quests: Record<string, unknown[]>;
    targets: Record<string, unknown[]>;
  };
  /** `seenOn` is the day of the newest cache read; each row has its own. */
  seenQuests: { seenOn: string; columns: string[]; quests: Record<string, unknown[]> };
}
