import { isNotFound } from "@platform/core/utils/isNotFound";
import type { DeleteFailureOutcome } from "../types/recipe/delete-outcome";

/**
 * What a failed delete means. A 404 means it's already gone (deleted elsewhere, or a double tap),
 * which is what was asked for: the caller treats it as removed and says so. Anything else left it
 * in place, so it says the delete failed and retrying stays possible.
 */
export function deleteFailureOutcome(
  error: unknown,
  messages: { gone: string; couldntDelete: string },
): DeleteFailureOutcome {
  return isNotFound(error)
    ? { isGone: true, message: messages.gone }
    : { isGone: false, message: messages.couldntDelete };
}
