import { TALENT_COLUMNS, TALENT_TIERS } from "@/games/wow-forever/data/talents/talentConfig";

/**
 * A tree's grid in CSS pixels, fixed so the prerequisite arrows (an SVG over
 * the grid) line up with the cells at any screen width. 4 × 52 + 3 × 16 = 256 px
 * fits a 375 px phone with the page's padding.
 */
export const TALENT_CELL_PX = 52;
export const TALENT_GAP_PX = 16;
export const TALENT_GRID_WIDTH_PX = TALENT_COLUMNS * TALENT_CELL_PX + (TALENT_COLUMNS - 1) * TALENT_GAP_PX;
export const TALENT_GRID_HEIGHT_PX = TALENT_TIERS * TALENT_CELL_PX + (TALENT_TIERS - 1) * TALENT_GAP_PX;
/** The arrowhead's length and half-width. */
export const TALENT_ARROW_HEAD_PX = 7;
