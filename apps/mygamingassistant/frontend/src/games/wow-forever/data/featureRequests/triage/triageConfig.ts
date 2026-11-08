/** The triage screen's timings, sizes and wire names. */

export const TRIAGE_PAGE_PATH = "/wow-forever/triage";

/** The triage API, relative to the shared axios instance's `/api` base. */
export const TRIAGE_API_BASE = "/wow/feature-requests/triage";

/** How long Approve / Not planned / Hide / a status change wait for Undo before they're sent. */
export const TRIAGE_UNDO_MS = 6000;

/** All requests rows per "Show more". */
export const TRIAGE_PAGE_SIZE = 20;

/** The inbox warns from here on (submitting stops at TRIAGE_INBOX_HARD_LIMIT). */
export const TRIAGE_INBOX_WARN_AT = 450;

/** The tab badge reads "99+" above this. */
export const TRIAGE_BADGE_CAP = 99;

/** A field's counter shows once it's this full. */
export const TRIAGE_COUNTER_SHOW_RATIO = 0.8;

/** "Maybe the same as…" shows at most this many, and only above this similarity. */
export const MERGE_SUGGESTION_COUNT = 3;
export const MERGE_SUGGESTION_MIN_SCORE = 0.2;
/** Added to a candidate's score when it's in the same area. */
export const MERGE_SAME_AREA_BOOST = 0.15;

/** The skeleton's card / row counts. */
export const TRIAGE_INBOX_SKELETON_CARDS = 2;
export const TRIAGE_LIST_SKELETON_ROWS = 5;

/** URL query keys. */
export const TRIAGE_PARAM = {
  tab: "tab",
  status: "status",
  area: "area",
  sort: "sort",
  edit: "story",
  merge: "merge",
  shipped: "ship",
  notPlanned: "decline",
  from: "from",
} as const;

/** `history.state` marker on entries a sheet pushed, so closing it can go Back instead of stacking. */
export const TRIAGE_SHEET_HISTORY_STATE = "triageSheet";
