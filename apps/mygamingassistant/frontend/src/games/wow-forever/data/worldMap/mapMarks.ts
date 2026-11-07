/**
 * The World Map's own marks and route ("My marks") and the "Share this view"
 * link. Marks are the player's own input — never Classic or Forever data.
 */

/** Every map's marks and route, in this browser only. Bump the version on a breaking shape change. */
export const MAP_MARKS_STORAGE_KEY = "mga.wowForever.worldMap.marks.v1";

/** Marks on one map; adding is refused past it. */
export const MAX_MARKS_PER_MAP = 30;
/** Marks across every map. */
export const MAX_MARKS_TOTAL = 200;
/** Stops in one map's route. */
export const MAX_ROUTE_STOPS = 25;
export const MAX_MARK_LABEL_LENGTH = 40;

/** A press held this long without moving (or a second finger) opens the map menu on a touch screen. */
export const LONG_PRESS_MS = 500;
/** The long-press ring starts filling after this, so a quick tap shows nothing. */
export const LONG_PRESS_FEEDBACK_MS = 150;
/** A `contextmenu` this soon after a touch press is the browser's own long-press: ours handles that. */
export const TOUCH_CONTEXT_MENU_WINDOW_MS = 1000;

/** A shared view rides in the URL fragment (`#view=…`), so it never reaches a server. */
export const MAP_VIEW_FRAGMENT_KEY = "view";
/** First field of the fragment; a link with any other version is refused. */
export const MAP_VIEW_FRAGMENT_VERSION = "1";
/** Longer fragments are refused unread (30 marks with long labels fit well under this). */
export const MAX_MAP_VIEW_FRAGMENT_LENGTH = 8000;
/** Where a share link opens. */
export const WORLD_MAP_PAGE_PATH = "/wow-forever/map";

/** How long "Copied" stays on a copy button. */
export const COPIED_RESET_MS = 2000;
