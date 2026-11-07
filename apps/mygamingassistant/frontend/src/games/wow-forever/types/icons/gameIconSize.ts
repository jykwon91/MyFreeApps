import type { GAME_ICON_SIZES } from "@/games/wow-forever/data/icons/wowIconConfig";

/** An icon's edge in CSS pixels. */
export type GameIconSize = (typeof GAME_ICON_SIZES)[number];
