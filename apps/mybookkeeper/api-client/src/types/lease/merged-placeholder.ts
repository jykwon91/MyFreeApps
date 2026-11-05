import type { LeaseTemplatePlaceholder } from "./lease-template-placeholder";
import type { PlaceholderProvenance } from "./placeholder-provenance";

/**
 * One placeholder across the picked templates. `template_ids` lists every
 * template using it; the first one picked supplies the value.
 */
export interface MergedPlaceholder {
  placeholder: LeaseTemplatePlaceholder;
  template_ids: string[];
  value: string | null;
  provenance: PlaceholderProvenance | null;
}
