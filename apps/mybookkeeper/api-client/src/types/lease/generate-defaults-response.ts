import type { PlaceholderDefault } from "./placeholder-default";

/**
 * Response from ``GET /lease-templates/{id}/generate-defaults``.
 * Mirrors backend ``GenerateDefaultsResponse``.
 */
export interface GenerateDefaultsResponse {
  defaults: PlaceholderDefault[];
}
