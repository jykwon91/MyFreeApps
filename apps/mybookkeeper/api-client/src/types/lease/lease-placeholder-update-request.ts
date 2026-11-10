import type { LeasePlaceholderInputType } from "./lease-placeholder-input-type";

/** Body of PATCH /lease-templates/{id}/placeholders/{placeholder_id}: only the fields sent change. */
export interface LeasePlaceholderUpdateRequest {
  display_label?: string;
  input_type?: LeasePlaceholderInputType;
  required?: boolean;
  default_source?: string | null;
  computed_expr?: string | null;
  display_order?: number;
}
