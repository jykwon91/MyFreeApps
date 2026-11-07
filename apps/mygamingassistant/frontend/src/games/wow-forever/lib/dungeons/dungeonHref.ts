import { DUNGEONS_PAGE_PATH } from "@/games/wow-forever/data/dungeons/dungeonPageConfig";
import { WORLD_MAP_PAGE_PATH } from "@/games/wow-forever/data/worldMap/mapMarks";
import { MAP_PARAM } from "@/games/wow-forever/hooks/useMapView";

/** `/wow-forever/dungeons/deadmines`. */
export function dungeonPageHref(slug: string): string {
  return `${DUNGEONS_PAGE_PATH}/${slug}`;
}

/** A boss section's element id: `boss-edwin-vancleef`. */
export function bossAnchorId(slug: string): string {
  return `boss-${slug}`;
}

/** `/wow-forever/dungeons/deadmines#boss-edwin-vancleef`. */
export function bossHref(dungeonSlug: string, bossSlug: string): string {
  return `${dungeonPageHref(dungeonSlug)}#${bossAnchorId(bossSlug)}`;
}

/** The World Map opened on a zone: `/wow-forever/map?m=1436`. */
export function worldMapZoneHref(zoneId: number): string {
  return `${WORLD_MAP_PAGE_PATH}?${MAP_PARAM}=${zoneId}`;
}
