import type { MergedPlaceholder } from "./merged-placeholder";

/** Mirrors `schemas/leases/multi_generate_defaults_response.py`. */
export interface MultiGenerateDefaultsResponse {
  placeholders: MergedPlaceholder[];
}
