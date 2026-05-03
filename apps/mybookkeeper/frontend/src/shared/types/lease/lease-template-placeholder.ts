import type { LeasePlaceholderInputType } from "@/shared/types/lease/lease-placeholder-input-type";

/**
 * Placeholder spec on a lease template.
 *
 * Mirrors `schemas/leases/lease_template_placeholder_response.py`.
 */
export interface LeaseTemplatePlaceholder {
  id: string;
  template_id: string;
  key: string;
  display_label: string;
  input_type: LeasePlaceholderInputType;
  required: boolean;
  default_source: string | null;
  computed_expr: string | null;
  display_order: number;
  created_at: string;
  updated_at: string;
}
