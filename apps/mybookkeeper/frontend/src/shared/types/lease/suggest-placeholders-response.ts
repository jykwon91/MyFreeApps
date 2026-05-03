import type { LeasePlaceholderInputType } from "@/shared/types/lease/lease-placeholder-input-type";

/**
 * A single AI-proposed placeholder — not yet persisted.
 *
 * Mirrors `schemas/leases/suggest_placeholders_response.py::SuggestedPlaceholderItem`.
 */
export interface SuggestedPlaceholderItem {
  key: string;
  description: string;
  input_type: LeasePlaceholderInputType;
}

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
