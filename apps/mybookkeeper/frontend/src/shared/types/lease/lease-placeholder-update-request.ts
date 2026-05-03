import type { LeasePlaceholderInputType } from "@/shared/types/lease/lease-placeholder-input-type";

export interface LeasePlaceholderUpdateRequest {
  display_label?: string;
  input_type?: LeasePlaceholderInputType;
  required?: boolean;
  default_source?: string | null;
  computed_expr?: string | null;
  display_order?: number;
}
