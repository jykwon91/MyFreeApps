import { RECIPES_MESSAGES } from "../constants/recipes";
import { VERSION_HISTORY_MESSAGES } from "../constants/versions";

/** What a rating says to a screen reader: "best rating 4 out of 5", or "No rating". */
export function ratingLabel(rating: number | null): string {
  return rating === null ? RECIPES_MESSAGES.noRating : VERSION_HISTORY_MESSAGES.bestRatingLabel(rating);
}
