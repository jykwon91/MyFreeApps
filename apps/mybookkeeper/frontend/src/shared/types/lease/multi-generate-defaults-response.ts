import type { LeaseTemplatePlaceholder } from "@/shared/types/lease/lease-template-placeholder";
import type { PlaceholderProvenance } from "@/shared/types/lease/placeholder-provenance";

/**
 * Response shape for POST /lease-templates/generate-defaults.
 *
 * Mirrors `schemas/leases/multi_generate_defaults_response.py`.
 */
export interface MergedPlaceholder {
  placeholder: LeaseTemplatePlaceholder;
  /** IDs of every template that defines this placeholder. */
  template_ids: string[];
  /** Resolved value using the FIRST template's default_source. Null if no source resolved. */
  value: string | null;
  provenance: PlaceholderProvenance | null;
}

export interface MultiGenerateDefaultsResponse {
  placeholders: MergedPlaceholder[];
}
