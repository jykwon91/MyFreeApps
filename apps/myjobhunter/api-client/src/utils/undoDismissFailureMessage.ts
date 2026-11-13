import { isNotFound } from "@platform/core/utils/isNotFound";
import { DISCOVER_ACTION_MESSAGES } from "../constants/discoverMessages";
import { discoverFailureMessage } from "./discoverFailureMessage";

/**
 * What to say when undo-dismiss fails, from the inbox's Undo toast or the Dismissed view's Restore.
 * A 404 means the posting can't come back any more (already brought back on another device, or
 * expired or closed since), so it gets a plain-language line rather than the server's generic "not
 * found"; the Discover lists refetch and drop it. Anything else: the server's reason when it gave
 * one, else the action's own `fallback`.
 */
export function undoDismissFailureMessage(error: unknown, fallback: string): string {
  if (isNotFound(error)) return DISCOVER_ACTION_MESSAGES.undoDismissGone;
  return discoverFailureMessage(error, fallback);
}
