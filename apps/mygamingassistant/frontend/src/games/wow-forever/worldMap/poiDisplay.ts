import { isServiceKind, SERVICE_LABEL, SERVICE_MARKER_CLASS } from "@/games/wow-forever/data/worldMap/serviceKinds";
import { DUNGEON_MARKER_CLASS, QUEST_MARKER_CLASS, RAID_MARKER_CLASS } from "@/games/wow-forever/data/worldMap/layerCatalog";
import { INSTANCE_KIND, type MapPoi } from "@/games/wow-forever/types/worldMap";

/** "Class trainer", "Quest giver", "Dungeon", "Raid". */
export function poiKindLabel(poi: Pick<MapPoi, "subkind">): string {
  if (isServiceKind(poi.subkind)) return SERVICE_LABEL[poi.subkind];
  if (poi.subkind === INSTANCE_KIND.dungeon) return "Dungeon";
  if (poi.subkind === INSTANCE_KIND.raid) return "Raid";
  return "Quest giver";
}

/** Map marker fill class. */
export function poiMarkerClass(poi: Pick<MapPoi, "subkind">): string {
  if (isServiceKind(poi.subkind)) return SERVICE_MARKER_CLASS[poi.subkind];
  if (poi.subkind === INSTANCE_KIND.dungeon) return DUNGEON_MARKER_CLASS;
  if (poi.subkind === INSTANCE_KIND.raid) return RAID_MARKER_CLASS;
  return QUEST_MARKER_CLASS;
}

/** Hover / screen-reader label for a marker: "Maximillian Crowe <Warlock Trainer> — Class trainer". */
export function poiMarkerLabel(poi: MapPoi): string {
  const title = poi.title ? ` <${poi.title}>` : "";
  return `${poi.name}${title} — ${poiKindLabel(poi)}`;
}
