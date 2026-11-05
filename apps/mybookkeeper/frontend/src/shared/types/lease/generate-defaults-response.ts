import type { PlaceholderProvenance } from "@mybookkeeper/api-client/types/lease/placeholder-provenance";

/**
 * Resolved default for a single placeholder key.
 * Mirrors backend ``PlaceholderDefault``.
 */
export interface PlaceholderDefault {
  key: string;
  value: string | null;
  provenance: PlaceholderProvenance;
}

/**
 * Response from ``GET /lease-templates/{id}/generate-defaults``.
 * Mirrors backend ``GenerateDefaultsResponse``.
 */
export interface GenerateDefaultsResponse {
  defaults: PlaceholderDefault[];
}
