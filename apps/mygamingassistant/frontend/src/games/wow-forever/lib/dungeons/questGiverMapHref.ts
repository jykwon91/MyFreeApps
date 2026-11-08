import { QUEST_GIVER_MAP_SCALE, QUEST_GIVER_MARK_ID } from "@/games/wow-forever/data/dungeons/dungeonPageConfig";
import { DEFAULT_MAP_LAYERS } from "@/games/wow-forever/data/worldMap/layerCatalog";
import { WORLD_MAP_PAGE_PATH } from "@/games/wow-forever/data/worldMap/mapMarks";
import { MAP_MARK_STYLE } from "@/games/wow-forever/data/worldMap/mapMarkStyles";
import type { QuestGiverPlace } from "@/games/wow-forever/types/dungeons/questGiverPlace";
import { encodeMapViewFragment } from "@/games/wow-forever/worldMap/mapViewShare";

/**
 * `/wow-forever/map?m=<zone>#view=1~…` — the World Map's own "Share this view"
 * link, zoomed in on the giver with one quest mark on it. The map shows the mark
 * read-only (never added to the player's marks unless they save it).
 */
export function questGiverMapHref(name: string, place: QuestGiverPlace): string {
  const fragment = encodeMapViewFragment({
    mapId: place.zoneId,
    viewport: { scale: QUEST_GIVER_MAP_SCALE, centerX: place.x / 100, centerY: place.y / 100 },
    layers: DEFAULT_MAP_LAYERS,
    marks: { marks: [{ id: QUEST_GIVER_MARK_ID, x: place.x, y: place.y, label: name, style: MAP_MARK_STYLE.quest }], route: [] },
  });
  return `${WORLD_MAP_PAGE_PATH}?m=${place.zoneId}#${fragment}`;
}
