import type { PlaceholderProvenance } from "./placeholder-provenance";

/**
 * Resolved default for a single placeholder key.
 * Mirrors backend ``PlaceholderDefault``.
 */
export interface PlaceholderDefault {
  key: string;
  value: string | null;
  provenance: PlaceholderProvenance;
}
