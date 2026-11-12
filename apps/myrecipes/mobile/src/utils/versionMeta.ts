import type { VersionSummary } from "@myrecipes/api-client/types/recipe/version";
import { VERSION_HISTORY_MESSAGES as MESSAGES } from "../constants/versions";
import type { VersionMetaPart } from "../types/VersionMetaPart";
import { countLabel } from "./countLabel";
import { formatVersionDate } from "./formatVersionDate";

/** A version's date, then the owner's cook count and best rating, which are null for anyone else. */
export function versionMeta(version: VersionSummary): VersionMetaPart[] {
  const date = formatVersionDate(version.created_at);
  const parts: VersionMetaPart[] = [{ text: date, spoken: date }];
  if (version.cook_count !== null) {
    const cooks = countLabel(version.cook_count, "cook");
    parts.push({ text: cooks, spoken: cooks });
  }
  if (version.best_rating !== null) {
    parts.push({ text: MESSAGES.bestRating(version.best_rating), spoken: MESSAGES.bestRatingLabel(version.best_rating) });
  }
  return parts;
}
