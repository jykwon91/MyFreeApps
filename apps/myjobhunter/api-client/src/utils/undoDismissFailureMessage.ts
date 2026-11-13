import { isNotFound } from "@platform/core/utils/isNotFound";
import { DISCOVER_ACTION_MESSAGES } from "../constants/discoverMessages";
import { triageFailureMessage } from "./triageFailureMessage";

/**
 * What to say when undo-dismiss fails, from the inbox's Undo toast or the Dismissed view's Restore.
 * A 404 means the posting can't come back any more (already brought back on another device, or
 * expired or closed since), so it gets a plain-language line rather than the server's generic "not
 * found"; the Discover lists refetch and drop it. A coded 409 (its twin from another source is in
 * Discover, or applied) reads as `triageFailureMessage` says. Anything else: the server's reason
 * when it gave one, else the action's own `fallback`.
 */
export function undoDismissFailureMessage(error: unknown, fallback: string): string {
  if (isNotFound(error)) return DISCOVER_ACTION_MESSAGES.undoDismissGone;
  return triageFailureMessage(error, fallback);
}
