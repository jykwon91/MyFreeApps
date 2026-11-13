/**
 * The boxes the scenario path (ScenarioPath, ScenarioCard) and its loading
 * skeleton (CatalogSkeleton) share, so the skeleton fills the same space as the
 * page it stands in for and nothing moves when the scenarios arrive. Each text
 * line's placeholder bar is that line's height: text-2xl -> h-8, text-base ->
 * h-6, text-sm -> h-5.
 */
export const CATALOG_PAGE = "space-y-4";
export const CATALOG_HEADER = "space-y-1";
/** The header's small lines (the level line and the "pick a scenario" line). */
export const CATALOG_HEADER_LINE = "text-sm";
/** The level line's "Change level" link is a touch target, so its row is at least 44px tall. */
export const CATALOG_TOUCH_ROW = "inline-flex min-h-[44px] items-center";
export const SCENARIO_LIST = "space-y-3";
export const SCENARIO_CARD_BOX = "rounded-lg border p-4";
/** Between a card's title and its goal. */
export const SCENARIO_GOAL_GAP = "mt-1";
/**
 * Room for two text-sm lines (20px each), for the lines whose wrap depends on
 * the width and the copy: the "pick a scenario" line and each card's goal. On
 * phones (and beside the sidebar) they take two lines, on wide screens one, so
 * holding two everywhere is what lets the skeleton know their height. Nothing is
 * clamped: a text needing a third line (about-me at 320px) still shows in full
 * and grows its box.
 */
export const TWO_TEXT_LINES = "min-h-10";
/** Placeholder cards while the path loads (the phone shows as many). */
export const SCENARIO_SKELETON_ROWS = 4;
