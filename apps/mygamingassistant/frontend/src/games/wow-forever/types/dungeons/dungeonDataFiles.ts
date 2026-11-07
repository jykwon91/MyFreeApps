import type { InteriorsFile } from "@/games/wow-forever/worldMap/interiors";

/**
 * The generated files a dungeon page is built from, as JSON: the World Map's
 * entrances and interiors, the zone names, and the dungeon generator's loot.
 */
export interface DungeonDataFiles {
  dungeons: { columns: string[]; rows: unknown[][] };
  interiors: InteriorsFile;
  zones: { zones: { id: number; name: string }[] };
  bossLoot: { lootColumns: string[]; instances: Record<string, Record<string, unknown[][]>> };
  lootItems: { clientBuild: string; columns: string[]; items: Record<string, unknown[]> };
}
