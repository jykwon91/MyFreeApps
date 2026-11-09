import type { FormWithFields } from "@mybookkeeper/api-client/types/tax/FormWithFields";
import type { TaxFormField } from "@mybookkeeper/api-client/types/tax/TaxFormField";
import type { TaxFormInstanceWithFields } from "@mybookkeeper/api-client/types/tax/TaxFormInstanceWithFields";

export function aTaxField(overrides: Partial<TaxFormField> = {}): TaxFormField {
  return {
    id: "f1",
    field_id: "line_3",
    label: "Rents received",
    value: 24000,
    type: "numeric",
    is_calculated: false,
    is_overridden: false,
    validation_status: "valid",
    validation_message: null,
    confidence: null,
    ...overrides,
  };
}

export function aTaxInstance(overrides: Partial<TaxFormInstanceWithFields> = {}): TaxFormInstanceWithFields {
  return {
    instance_id: "i1",
    instance_label: "123 Main St",
    source_type: "computed",
    property_id: null,
    issuer_name: null,
    document_id: null,
    fields: [aTaxField()],
    ...overrides,
  };
}

export function aTaxForm(instances: TaxFormInstanceWithFields[] = [aTaxInstance()]): FormWithFields {
  return { form_name: "schedule_e", instances };
}
