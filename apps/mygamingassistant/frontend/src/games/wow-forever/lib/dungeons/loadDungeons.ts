import { decodeDungeons } from "@/games/wow-forever/lib/dungeons/decodeDungeons";
import type { DungeonDataFiles } from "@/games/wow-forever/types/dungeons/dungeonDataFiles";
import type { DungeonsData } from "@/games/wow-forever/types/dungeons/dungeonsData";

let cached: Promise<DungeonsData> | null = null;

/** The dungeon pages' data, loaded once in its own chunks (a failed load is tried again next time). */
export function loadDungeons(): Promise<DungeonsData> {
  if (!cached) {
    cached = Promise.all([
      import("@/games/wow-forever/data/worldMap/classic/classicDungeons.json"),
      import("@/games/wow-forever/data/worldMap/classic/classicInteriors.json"),
      import("@/games/wow-forever/data/worldMap/zones.json"),
      import("@/games/wow-forever/data/dungeons/classic/bossLoot.json"),
      import("@/games/wow-forever/data/dungeons/lootItems.json"),
    ]).then(([dungeons, interiors, zones, bossLoot, lootItems]) =>
      decodeDungeons({
        dungeons: dungeons.default,
        interiors: interiors.default,
        zones: zones.default,
        bossLoot: bossLoot.default,
        lootItems: lootItems.default,
      } as unknown as DungeonDataFiles),
    );
    cached.catch(() => {
      cached = null;
    });
  }
  return cached;
}
