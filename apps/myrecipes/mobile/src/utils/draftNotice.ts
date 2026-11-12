import { draftNeedsReview } from "@myrecipes/api-client/utils/draftNeedsReview";
import { DRAFT_FILLED_IN, DRAFT_NEEDS_REVIEW } from "../constants/newRecipe";
import type { DraftNotice } from "../types/DraftNotice";
import type { NewRecipeSeed } from "../types/NewRecipeSeed";

/** A thin draft asks to be checked; a whole one says where it came from, if that isn't already clear. */
export function draftNotice({ draft, origin }: NewRecipeSeed): DraftNotice | null {
  if (draftNeedsReview(draft)) return { message: DRAFT_NEEDS_REVIEW[origin], tone: "error" };
  const filledIn = DRAFT_FILLED_IN[origin];
  return filledIn ? { message: filledIn, tone: "success" } : null;
}
