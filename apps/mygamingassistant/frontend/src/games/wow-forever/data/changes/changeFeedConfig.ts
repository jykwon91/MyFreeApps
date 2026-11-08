import type { ChangeCategory } from "@/games/wow-forever/types/changes/changeCategory";

/** The Changes vs Classic page. */
export const CHANGES_PATH = "/wow-forever/changes";

/** URL params (every change replaces history). */
export const CHANGE_CATEGORY_PARAM = "cat";
export const CHANGE_CLASS_PARAM = "class";
export const CHANGE_QUERY_PARAM = "q";
export const CHANGE_SINCE_PARAM = "since";
export const CHANGE_SINCE_ON = "1";
/** The category a plain `/wow-forever/changes` shows. */
export const DEFAULT_CHANGE_CATEGORY: ChangeCategory = "talents";

/** Rows shown at first, and added by each "Show more". */
export const CHANGE_PAGE_SIZE = 50;
/** Placeholder cards while a shard loads. */
export const CHANGE_SKELETON_ROWS = 6;
