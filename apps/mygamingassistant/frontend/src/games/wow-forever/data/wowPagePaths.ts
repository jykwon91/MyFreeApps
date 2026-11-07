import { COMPANION_GAMES, WOW_FOREVER_SLUG } from "@/games/registry";

const WOW = COMPANION_GAMES[WOW_FOREVER_SLUG];

/** The hub's path ("Overview" in the left nav). */
export const WOW_HUB_PATH = WOW.landingPath;

/** Every page that can carry an update dot: the hub and each hub tile. */
export const WOW_PAGE_PATHS: readonly string[] = [WOW_HUB_PATH, ...WOW.features.map((f) => f.path)];
