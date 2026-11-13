/**
 * The CS2 map board's API, mocked: the game, the Mirage map with three zones, and
 * thirteen accepted lineups (every zone x every utility, plus one for either side). The lineups and zone
 * density answer the way the backend does for the side and utility filters, so a
 * filter the page sends changes what comes back. Media URLs are null (the board
 * falls back to text), so nothing but the API is fetched.
 */
import type { Page } from "@playwright/test";
import { apiPath } from "@platform/ui/test-support/apiPath";
import { PIXEL_PNG } from "@platform/ui/test-support/constants/pixelPng";
import { json } from "@platform/ui/test-support/mockResponse";
import type { Game, Lineup, MapDetail, MapZone, UtilityType, UtilityTypeRead, ZoneDensity, ZoneRead } from "@/types/game";

export const GAME_SLUG = "cs2";
export const MAP_SLUG = "mirage";
export const MAP_PATH = `/${GAME_SLUG}/${MAP_SLUG}`;

const CS2: Game = {
  id: "g-cs2",
  slug: GAME_SLUG,
  name: "Counter-Strike 2",
  kind: "lineups",
  side_a_label: "T",
  side_b_label: "CT",
};

/** A square polygon of 0-1 minimap coordinates. */
function square(x: number, y: number, size: number): MapZone["polygon_points"] {
  return [
    { x, y },
    { x: x + size, y },
    { x: x + size, y: y + size },
    { x, y: y + size },
  ];
}

const TARGET_ZONES: MapZone[] = [
  { id: "z-a", slug: "a-site", name: "A Site", polygon_points: square(0.1, 0.1, 0.3) },
  { id: "z-b", slug: "b-site", name: "B Site", polygon_points: square(0.6, 0.1, 0.3) },
  { id: "z-mid", slug: "mid", name: "Mid", polygon_points: square(0.35, 0.55, 0.3) },
];

const STAND_ZONES: ZoneRead[] = [
  { id: "s-0", slug: "t-spawn", name: "T Spawn", polygon_points: [] },
  { id: "s-1", slug: "palace", name: "Palace", polygon_points: [] },
  { id: "s-2", slug: "underpass", name: "Underpass", polygon_points: [] },
  { id: "s-3", slug: "ramp", name: "Ramp", polygon_points: [] },
];

const JUNGLE: ZoneRead = { id: "s-4", slug: "jungle", name: "Jungle", polygon_points: [] };

const UTILITIES: UtilityType[] = [
  { id: "u-smoke", slug: "smoke", name: "Smoke", agent_slug: null, placement: "thrown" },
  { id: "u-flash", slug: "flash", name: "Flash", agent_slug: null, placement: "thrown" },
  { id: "u-molotov", slug: "molotov", name: "Molotov", agent_slug: null, placement: "thrown" },
  { id: "u-grenade", slug: "grenade", name: "HE", agent_slug: null, placement: "thrown" },
];

/** Mirage's detail: its minimap and the three zones lineups target. */
export const MIRAGE: MapDetail = {
  id: "m-mirage",
  slug: MAP_SLUG,
  name: "Mirage",
  minimap_url: "/e2e-assets/mirage-minimap.png",
  zones: TARGET_ZONES,
  sites: [],
  utility_types: UTILITIES,
  agents: [],
  present_utility_type_slugs: UTILITIES.map((u) => u.slug),
};

function utilityRead(util: UtilityType): UtilityTypeRead {
  return { id: util.id, slug: util.slug, name: util.name, placement: util.placement, agent: null };
}

function lineup(zoneIndex: number, utilIndex: number): Lineup {
  const zone = TARGET_ZONES[zoneIndex]!;
  const util = UTILITIES[utilIndex]!;
  const stand = STAND_ZONES[utilIndex]!;
  const side = (zoneIndex + utilIndex) % 2 === 0 ? "side_a" : "side_b";
  return {
    id: `l-${zone.slug}-${util.slug}`,
    game_id: CS2.id,
    map_id: MIRAGE.id,
    target_zone_id: zone.id,
    stand_zone_id: stand.id,
    side,
    utility_type_id: util.id,
    title: `${util.name} ${zone.name} from ${stand.name}`,
    notes: null,
    stand_screenshot_url: null,
    aim_screenshot_url: null,
    landing_screenshot_url: null,
    clip_url: null,
    clip_url_original: null,
    clip_trim_start_s: null,
    clip_trim_end_s: null,
    clip_source_start_in_video_s: null,
    landing_clip_url: null,
    landing_clip_url_original: null,
    landing_clip_trim_start_s: null,
    landing_clip_trim_end_s: null,
    landing_clip_source_start_in_video_s: null,
    stand_clip_url: null,
    aim_clip_url: null,
    stand_clip_offset_s: null,
    aim_clip_offset_s: null,
    aim_anchor_x: null,
    aim_anchor_y: null,
    stand_anchor_x: null,
    stand_anchor_y: null,
    target_anchor_x: null,
    target_anchor_y: null,
    effective_stand_x: 0.2 + 0.1 * utilIndex,
    effective_stand_y: 0.8,
    effective_target_x: 0.2 + 0.25 * zoneIndex,
    effective_target_y: 0.3,
    setup_seconds: 6,
    technique: "Jumpthrow + LMB",
    attribution_url: null,
    attribution_author: null,
    status: "accepted",
    youtube_video_id: null,
    chapter_start_seconds: null,
    chapter_title: null,
    suggested_game_id: null,
    suggested_map_id: null,
    suggested_target_zone_id: null,
    suggested_stand_zone_id: null,
    suggested_side: null,
    suggested_utility_type_id: null,
    classification_confidence: null,
    classification_reasoning: null,
    target_zone: TARGET_ZONES[zoneIndex]!,
    stand_zone: stand,
    utility_type: utilityRead(util),
  };
}

/** A lineup that works from either side: the backend returns it whatever side is asked for. */
const EITHER_SIDE: Lineup = {
  ...lineup(0, 0),
  id: "l-a-site-smoke-either-side",
  side: "any",
  stand_zone_id: JUNGLE.id,
  stand_zone: JUNGLE,
  title: "Smoke A Site from Jungle",
};

export const MIRAGE_LINEUPS: Lineup[] = [
  ...TARGET_ZONES.flatMap((_, zoneIndex) => UTILITIES.map((_, utilIndex) => lineup(zoneIndex, utilIndex))),
  EITHER_SIDE,
];

/**
 * The lineups the backend returns for a side filter and a comma-separated utility filter (each may be
 * absent). Like the backend: "any" (or no side) is no side filter, a side keeps the lineups for either
 * side too, and utility slugs the map doesn't have are no utility filter.
 */
export function lineupsFor(side: string | null, utils: string | null): Lineup[] {
  const known = utils?.split(",").filter((slug) => UTILITIES.some((u) => u.slug === slug)) ?? [];
  return MIRAGE_LINEUPS.filter(
    (l) =>
      (!side || side === "any" || l.side === side || l.side === "any") &&
      (known.length === 0 || known.includes(l.utility_type?.slug ?? "")),
  );
}

function density(lineups: Lineup[]): ZoneDensity {
  const out: ZoneDensity = {};
  for (const l of lineups) {
    const entry = (out[l.target_zone_id!] ??= { count: 0, by_utility: {} });
    entry.count += 1;
    const slug = l.utility_type!.slug;
    entry.by_utility[slug] = (entry.by_utility[slug] ?? 0) + 1;
  }
  return out;
}

/** Answers the games, map detail, lineups, zone density and minimap image the map board reads. Register after stubUnmatchedApi. */
export async function stubMapBoard(page: Page): Promise<void> {
  await page.route(apiPath(/^\/games$/), (route) => route.fulfill(json([CS2])));
  await page.route(apiPath(new RegExp(`^/games/${GAME_SLUG}/maps/${MAP_SLUG}$`)), (route) => route.fulfill(json(MIRAGE)));
  // Zone density names its utility filter `util`; the lineup list names it `utility_type_slugs`.
  // Only Mirage has lineups; any other map answers empty, as the backend does.
  await page.route(apiPath(/^\/games\/[^/]+\/maps\/[^/]+\/zone-density$/), (route) => {
    const url = new URL(route.request().url());
    const onMirage = url.pathname.endsWith(`/games/${GAME_SLUG}/maps/${MAP_SLUG}/zone-density`);
    return route.fulfill(json(onMirage ? density(lineupsFor(url.searchParams.get("side"), url.searchParams.get("util"))) : {}));
  });
  await page.route(apiPath(/^\/lineups$/), (route) => {
    const { searchParams } = new URL(route.request().url());
    const onMirage = searchParams.get("game_slug") === GAME_SLUG && searchParams.get("map_slug") === MAP_SLUG;
    return route.fulfill(json(onMirage ? lineupsFor(searchParams.get("side"), searchParams.get("utility_type_slugs")) : []));
  });
  await page.route((url) => url.pathname === MIRAGE.minimap_url, (route) =>
    route.fulfill({ contentType: "image/png", body: PIXEL_PNG }),
  );
}
