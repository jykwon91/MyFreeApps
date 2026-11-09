import type { SourceType } from "./SourceType";

export interface TaxFormInstance {
  instance_id: string;
  instance_label: string | null;
  source_type: SourceType;
  property_id: string | null;
  issuer_name: string | null;
  document_id: string | null;
}
