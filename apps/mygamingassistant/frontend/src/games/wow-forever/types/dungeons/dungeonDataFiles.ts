import type { InteriorsFile } from "@/games/wow-forever/worldMap/interiors";

/**
 * The generated files a dungeon page is built from, as JSON: the World Map's
 * entrances and interiors, Forever's own dungeons, and the dungeon generator's loot and facts. Zones
 * and flight paths are decoded by the World Map's own decoders first
 * (`DungeonWorld`).
 */
export interface DungeonDataFiles {
  dungeons: { columns: string[]; rows: unknown[][] };
  /** Forever's own dungeons — rows, and each one's bosses by instance id (`foreverDungeons.json`). */
  foreverDungeons: { columns: string[]; bossColumns: string[]; rows: unknown[][]; bosses: Record<string, unknown[][]> };
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
  /** Forever's own dungeons' quests from Blizzard's Game Data API, rows by instance id (`foreverDungeonQuests.json`). */
  foreverQuests: { build: string; columns: string[]; quests: Record<string, unknown[][]> };
  /** Every quest the operator's client has seen (`quests/questSeen.json`): the levels the API doesn't give. */
  questSeen: { columns: string[]; quests: Record<string, readonly unknown[]> };
}
