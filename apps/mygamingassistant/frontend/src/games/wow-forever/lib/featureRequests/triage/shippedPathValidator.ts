import { TRIAGE_FIELD_MAX } from "@/games/wow-forever/data/featureRequests/triage/triageLimits";

/**
 * The PATCH schema's `shipped_path` pattern, character for character (`backend/app/schemas/wow/
 * feature_requests/triage_story_patch.py`) — a test reads the backend file and compares.
 */
export const SHIPPED_PATH_SCHEMA_PATTERN = String.raw`^/wow-forever(/[A-Za-z0-9/_\-]*)?(\?[A-Za-z0-9=&_.,:\-]*)?$`;

/** The database CHECK `ck_wowfeaturestory_shipped_path` (`backend/app/models/wow/feature_story.py`). */
export const SHIPPED_PATH_CHECK_PATTERN = String.raw`^/wow-forever(/|\?|$)`;

const SCHEMA_RE = new RegExp(SHIPPED_PATH_SCHEMA_PATTERN);
const CHECK_RE = new RegExp(SHIPPED_PATH_CHECK_PATTERN);

/** True when the server will take this as a shipped story's link: a page on this site under /wow-forever. */
export function isValidShippedPath(path: string): boolean {
  return path.length <= TRIAGE_FIELD_MAX.shipped_path && SCHEMA_RE.test(path) && CHECK_RE.test(path);
}
