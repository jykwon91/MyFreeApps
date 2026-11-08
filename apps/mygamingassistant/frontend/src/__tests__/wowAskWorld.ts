/** The real World Map data, decoded once for the "Ask" tool tests. */
import zonesJson from "@/games/wow-forever/data/worldMap/zones.json";
import travelJson from "@/games/wow-forever/data/worldMap/travel.json";
import servicesJson from "@/games/wow-forever/data/worldMap/classic/classicServices.json";
import questsJson from "@/games/wow-forever/data/worldMap/classic/classicQuests.json";
import dungeonsJson from "@/games/wow-forever/data/worldMap/classic/classicDungeons.json";
import masksJson from "@/games/wow-forever/data/worldMap/mapMasks.json";
import areasJson from "@/games/wow-forever/data/worldMap/areas.json";
import interiorsJson from "@/games/wow-forever/data/worldMap/classic/classicInteriors.json";
import { DEFAULT_PLAYER_SETTINGS, type PlayerSettings } from "@/games/wow-forever/hooks/usePlayerSettings";
import { loadDungeons } from "@/games/wow-forever/lib/dungeons/loadDungeons";
import { decodeClientItems } from "@/games/wow-forever/lib/decodeClientItems";
import type { AskToolData } from "@/games/wow-forever/types/ask/askToolData";
import { decodeWorldMap } from "@/games/wow-forever/worldMap/decodeWorldMap";
import { buildPlaces } from "@/games/wow-forever/worldMap/places";
import { FIXTURE_FILE } from "./wowClientItemsFixture";

export const ASK_WORLD = decodeWorldMap({
  zones: zonesJson,
  travel: travelJson,
  services: servicesJson,
  quests: questsJson,
  dungeons: dungeonsJson,
  masks: masksJson,
  areas: areasJson,
  interiors: interiorsJson,
});
export const ASK_PLACES = buildPlaces(ASK_WORLD);

export function askToolData(player: Partial<PlayerSettings> = {}): AskToolData {
  return {
    world: ASK_WORLD,
    places: ASK_PLACES,
    loadItems: () => Promise.resolve(decodeClientItems(FIXTURE_FILE, [])),
    loadDungeons,
    loadWalkGraphs: () => Promise.resolve(new Map()),
    player: { ...DEFAULT_PLAYER_SETTINGS, ...player },
  };
}
