import type { FieldValueType } from "./FieldValueType";
import type { TaxFieldValue } from "./TaxFieldValue";
import type { ValidationStatus } from "./ValidationStatus";

export interface TaxFormField {
  id: string;
  field_id: string;
  label: string;
  value: TaxFieldValue;
  type: FieldValueType;
  is_calculated: boolean;
  is_overridden: boolean;
  validation_status: ValidationStatus;
  validation_message: string | null;
  confidence: string | null;
}
