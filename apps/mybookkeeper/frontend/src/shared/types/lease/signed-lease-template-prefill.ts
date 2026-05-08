export interface SignedLeaseTemplatePrefillItem {
  key: string;
  display_label: string;
  input_type: string;
  required: boolean;
  value: string;
  provenance: string | null;
}

export interface SignedLeaseTemplatePrefillResponse {
  items: SignedLeaseTemplatePrefillItem[];
}
