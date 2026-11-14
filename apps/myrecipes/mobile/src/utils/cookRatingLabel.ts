import { COOK_LOG_PHONE_MESSAGES as MESSAGES } from "../constants/cookLog";
import { RECIPES_MESSAGES } from "../constants/recipes";

/** What a cook's rating says to a screen reader: "rated 4 out of 5", or "No rating". */
export function cookRatingLabel(rating: number | null): string {
  return rating === null ? RECIPES_MESSAGES.noRating : MESSAGES.rated(rating);
}
