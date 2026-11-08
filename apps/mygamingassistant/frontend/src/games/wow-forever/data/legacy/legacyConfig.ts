/** The Legacy planner's fixed values: path, storage key, URL param and texts. */

export const LEGACY_PAGE_PATH = "/wow-forever/legacy";

/** Ticked challenges (challenge ids). Stored — never rename. */
export const LEGACY_CHECKLIST_STORAGE_KEY = "mga.wowForever.legacy.checklist.v1";

/** The plan in the URL: `?b=1-<tree 1>-<tree 2>-<tree 3>`. */
export const LEGACY_PLAN_PARAM = "b";
/** Bump (and keep decoding the old one) for any change to the plan code. */
export const LEGACY_PLAN_VERSION = "1";
export const LEGACY_PLAN_SEPARATOR = "-";
/** Most a plan code may be — anything longer is not ours. */
export const LEGACY_PLAN_MAX_LENGTH = 64;

/** Nodes the skeleton draws per tree while the data loads. */
export const LEGACY_SKELETON_NODES = 9;

/** What the game files don't say. Shown where the fact would be — never guessed. */
export const LEGACY_UNKNOWN = {
  rankEarned: "Not known yet",
  linkRule: "Not known yet",
  perRank: "Not known yet",
} as const;

/** The Legacy data's load states (`LegacyState.status`). */
export const LEGACY_STATUS = { loading: "loading", ready: "ready", error: "error" } as const;
