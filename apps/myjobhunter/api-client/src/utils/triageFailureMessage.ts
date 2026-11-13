import { DISCOVER_ACTION_MESSAGES } from "../constants/discoverMessages";
import { DISCOVER_CONFLICT_CODES } from "../constants/discoverConflictCodes";
import { discoverFailureMessage } from "./discoverFailureMessage";
import type { DiscoverConflictError } from "../types/discover-conflict-error";
import { isDiscoverConflictError } from "./isDiscoverConflictError";

const CONFLICT_MESSAGES: Record<DiscoverConflictError["data"]["detail"]["code"], string> = {
  [DISCOVER_CONFLICT_CODES.alreadyApplied]: DISCOVER_ACTION_MESSAGES.alreadyApplied,
  [DISCOVER_CONFLICT_CODES.duplicate]: DISCOVER_ACTION_MESSAGES.duplicate,
  [DISCOVER_CONFLICT_CODES.noLongerListed]: DISCOVER_ACTION_MESSAGES.noLongerListed,
};

/**
 * What to say when Dismiss, Save or Restore fails on a Discover card. The coded 409s get a
 * plain-language line, and the Discover lists refetch and drop the stale card:
 * - already applied: the posting was added to Applications (on another device, or by a tap on Apply
 *   a moment before), so it has left Discover;
 * - duplicate: a dismissed posting whose twin from another source is already in Discover;
 * - no longer listed: the same, but that twin has since expired or closed.
 * Anything else: the server's reason when it gave one, else the action's own `fallback`.
 */
export function triageFailureMessage(error: unknown, fallback: string): string {
  if (isDiscoverConflictError(error)) return CONFLICT_MESSAGES[error.data.detail.code];
  return discoverFailureMessage(error, fallback);
}
