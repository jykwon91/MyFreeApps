export interface SignedLeaseTemplatePrefillItem {
  key: string;
  display_label: string;
  input_type: string;
  required: boolean;
  value: string;
  provenance: string | null;
  is_from_existing_values: boolean;
  /** Already on a locked lease, so it is shown but cannot change. */
  is_read_only: boolean;
}

export interface SignedLeaseTemplatePrefillResponse {
  items: SignedLeaseTemplatePrefillItem[];
}
