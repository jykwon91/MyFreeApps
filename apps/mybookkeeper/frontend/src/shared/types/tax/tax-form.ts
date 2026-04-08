export type SourceType = "extracted" | "computed" | "manual";

export type FormFieldStatus = "draft" | "validated" | "flagged" | "locked";

export type FieldValueType = "numeric" | "text" | "boolean";

export type ValidationStatus = "unvalidated" | "valid" | "warning" | "error";

export interface TaxFormInstance {
  instance_id: string;
  instance_label: string | null;
  form_name: string;
  source_type: SourceType;
  status: FormFieldStatus;
  property_id: string | null;
  issuer_name: string | null;
  document_id: string | null;
}

export interface TaxFormField {
  id: string;
  field_id: string;
  label: string;
  value: number | string | boolean | null;
  type: FieldValueType;
  is_calculated: boolean;
  is_overridden: boolean;
  validation_status: ValidationStatus;
  validation_message: string | null;
  confidence: string | null;
}

export interface FormWithFields {
  form_name: string;
  instances: Array<TaxFormInstance & { fields: TaxFormField[] }>;
}
