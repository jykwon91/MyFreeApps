import type { SuggestedPlaceholderItem } from "./suggested-placeholder-item";

/**
 * Response from POST /lease-templates/{id}/suggest-placeholders.
 *
 * Mirrors `schemas/leases/suggest_placeholders_response.py::SuggestPlaceholdersResponse`.
 */
export interface SuggestPlaceholdersResponse {
  suggestions: SuggestedPlaceholderItem[];
  truncated: boolean;
  pages_note: string | null;
}
