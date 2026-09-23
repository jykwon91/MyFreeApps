import type { WorldMapData } from "@/games/wow-forever/types/worldMap";
import { decodeWorldMap } from "@/games/wow-forever/worldMap/decodeWorldMap";

let cached: Promise<WorldMapData> | null = null;

/**
 * Load the World Map data once per page session. The JSON is split into its
 * own chunks so the other WoW pages never download it.
 */
export function loadWorldMap(): Promise<WorldMapData> {
  if (!cached) {
    cached = Promise.all([
      import("@/games/wow-forever/data/worldMap/zones.json"),
      import("@/games/wow-forever/data/worldMap/travel.json"),
      import("@/games/wow-forever/data/worldMap/classic/classicServices.json"),
      import("@/games/wow-forever/data/worldMap/classic/classicQuests.json"),
      import("@/games/wow-forever/data/worldMap/classic/classicDungeons.json"),
      import("@/games/wow-forever/data/worldMap/mapMasks.json"),
    ]).then(([zones, travel, services, quests, dungeons, masks]) =>
      decodeWorldMap({
        zones: zones.default,
        travel: travel.default,
        services: services.default,
        quests: quests.default,
        dungeons: dungeons.default,
        masks: masks.default,
      }),
    );
    // A failed load (offline, bad deploy) must be retryable.
    cached.catch(() => {
      cached = null;
    });
  }
  return cached;
}
