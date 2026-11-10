import type { LeasePlaceholderInputType } from "./lease-placeholder-input-type";

/**
 * A single AI-proposed placeholder, not yet persisted.
 *
 * Mirrors `schemas/leases/suggest_placeholders_response.py::SuggestedPlaceholderItem`.
 */
export interface SuggestedPlaceholderItem {
  key: string;
  description: string;
  input_type: LeasePlaceholderInputType;
}
