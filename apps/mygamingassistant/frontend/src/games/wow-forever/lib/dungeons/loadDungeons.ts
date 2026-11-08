import { decodeDungeons } from "@/games/wow-forever/lib/dungeons/decodeDungeons";
import type { DungeonDataFiles } from "@/games/wow-forever/types/dungeons/dungeonDataFiles";
import type { DungeonsData } from "@/games/wow-forever/types/dungeons/dungeonsData";
import { decodeTravel, decodeZone } from "@/games/wow-forever/worldMap/decodeWorldMap";

let cached: Promise<DungeonsData> | null = null;

/** The dungeon pages' data, loaded once in its own chunks (a failed load is tried again next time). */
export function loadDungeons(): Promise<DungeonsData> {
  if (!cached) {
    cached = Promise.all([
      import("@/games/wow-forever/data/worldMap/classic/classicDungeons.json"),
      import("@/games/wow-forever/data/worldMap/classic/classicInteriors.json"),
      import("@/games/wow-forever/data/worldMap/zones.json"),
      import("@/games/wow-forever/data/worldMap/travel.json"),
      import("@/games/wow-forever/data/dungeons/classic/bossLoot.json"),
      import("@/games/wow-forever/data/dungeons/lootItems.json"),
      import("@/games/wow-forever/data/dungeons/dungeonFacts.json"),
      import("@/games/wow-forever/data/dungeons/classic/entryRequirements.json"),
    ]).then(([dungeons, interiors, zones, travel, bossLoot, lootItems, facts, entry]) =>
      decodeDungeons(
        {
          dungeons: dungeons.default,
          interiors: interiors.default,
          bossLoot: bossLoot.default,
          lootItems: lootItems.default,
          facts: facts.default,
          entry: entry.default,
        } as unknown as DungeonDataFiles,
        { zones: zones.default.zones.map(decodeZone), flightNodes: decodeTravel(travel.default).flightNodes },
      ),
    );
    cached.catch(() => {
      cached = null;
    });
  }
  return cached;
}
