import type { DiscoveredDetail } from "../types/recipe/discovery";
import type { RecipeExtractionDraft } from "../types/recipe/extraction";

/**
 * The draft to save a discovered recipe from, with the page it came from recorded as the source
 * so the provenance survives the save.
 */
export function discoveredRecipeDraft(detail: DiscoveredDetail): RecipeExtractionDraft {
  const attribution = detail.site_name ? `${detail.site_name} (${detail.url})` : detail.url;
  return { ...detail.draft, source: detail.draft.source ? attribution : detail.url };
}
