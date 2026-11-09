/**
 * Links out of the "Ask" chat's guide cards: directions to a spot (the World
 * Map's own `pt:` endpoint) and the guide pages, opened on what was asked.
 */
import { ASK_GUIDE_PATH } from "@/games/wow-forever/data/ask/askGuidePages";
import { AUCTION_HOUSE_PARAM, AUCTION_QUERY_PARAM } from "@/games/wow-forever/data/auctionHouse/auctionHouseParams";
import type { WowClassId } from "@/games/wow-forever/data/classes";
import { MACRO_CLASS_PARAM } from "@/games/wow-forever/data/macros/macroClassFilter";
import { PROFESSION_PARAM, type GuideProfession } from "@/games/wow-forever/data/professions/professionPicker";
import { RARE_FIT_LEVELS_ABOVE, RARE_FIT_LEVELS_BELOW, RARE_LEVEL_MIN, RARES_PAGE_PATH } from "@/games/wow-forever/data/rares/raresConfig";
import { GOLD_FARM_SECTION_ID } from "@/games/wow-forever/gold/goldFarms";
import { SKILL_PARAM } from "@/games/wow-forever/hooks/useCraftingSkill";
import { DIR_PARAM, FROM_PARAM, TO_PARAM } from "@/games/wow-forever/hooks/useTrip";
import { DEFAULT_RARE_FILTERS, writeRareFilters } from "@/games/wow-forever/lib/rares/rareFilterParams";
import type { AskOrigin } from "@/games/wow-forever/types/ask/askOrigin";
import type { PriceFaction } from "@/games/wow-forever/types/priceFaction";
import { ENDPOINT_KIND, formatEndpoint } from "@/games/wow-forever/worldMap/trip";

const MAP_PATH = "/wow-forever/map";
const DIRECTIONS_OPEN = "1";

function withParams(path: string, params: URLSearchParams): string {
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

/** Directions to a spot; From only when the player said where they are, like "Route there" on an NPC. */
export function routeToSpotHref(spot: { zoneId: number; x: number; y: number }, origin: AskOrigin | null): string {
  const params = new URLSearchParams();
  params.set(TO_PARAM, formatEndpoint({ kind: ENDPOINT_KIND.point, zoneId: spot.zoneId, x: spot.x, y: spot.y }));
  if (origin?.fromMessage) {
    params.set(FROM_PARAM, formatEndpoint({ kind: ENDPOINT_KIND.point, zoneId: origin.zoneId, x: origin.x, y: origin.y }));
  }
  params.set(DIR_PARAM, DIRECTIONS_OPEN);
  return withParams(MAP_PATH, params);
}

/** The Rares list on the same level band as the tool, in the zone when it had rares there. */
export function raresPageHref(level: number, zoneId: number | null): string {
  const params = writeRareFilters(new URLSearchParams(), {
    ...DEFAULT_RARE_FILTERS,
    zoneId,
    minLevel: Math.max(RARE_LEVEL_MIN, level - RARE_FIT_LEVELS_BELOW),
    maxLevel: level + RARE_FIT_LEVELS_ABOVE,
  });
  return withParams(RARES_PAGE_PATH, params);
}

/** The profession's guide, at the player's skill when they said one. */
export function professionPageHref(profession: GuideProfession, skill: number | null): string {
  const params = new URLSearchParams({ [PROFESSION_PARAM]: profession });
  if (skill !== null) params.set(SKILL_PARAM, String(skill));
  return withParams(ASK_GUIDE_PATH.professions, params);
}

export function goldFarmsHref(): string {
  return `${ASK_GUIDE_PATH.gold}#${GOLD_FARM_SECTION_ID}`;
}

export function macrosPageHref(classId: WowClassId | null): string {
  const params = new URLSearchParams();
  if (classId !== null) params.set(MACRO_CLASS_PARAM, classId);
  return withParams(ASK_GUIDE_PATH.macros, params);
}

/** The Auction house page, searching for what was asked. */
/** The Auction house page on the same house the answer came from. */
export function auctionHouseHref(query: string, faction: PriceFaction): string {
  const params = new URLSearchParams({ [AUCTION_QUERY_PARAM]: query, [AUCTION_HOUSE_PARAM]: faction });
  return withParams(ASK_GUIDE_PATH.auctionHouse, params);
}

export function serverStatusHref(): string {
  return ASK_GUIDE_PATH.serverStatus;
}
