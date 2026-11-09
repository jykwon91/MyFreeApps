import type { FormWithFields } from "@mybookkeeper/api-client/types/tax/FormWithFields";
import type { TaxFormField } from "@mybookkeeper/api-client/types/tax/TaxFormField";
import type { TaxFormInstance } from "@mybookkeeper/api-client/types/tax/TaxFormInstance";
import { formatTaxFieldValue } from "@mybookkeeper/api-client/utils/formatTaxFieldValue";
import { taxFieldSourceMode } from "@mybookkeeper/api-client/utils/taxFieldSourceMode";
import { getFormLabel } from "@mybookkeeper/api-client/utils/taxFormLabel";
import { TAX_FIELD_STATUS_LABELS, TAX_FORM_MESSAGES as MESSAGES, TAX_SOURCE_LABELS } from "../../constants/taxForm";
import type { TaxFormSection } from "../../types/TaxFormSection";

/** One section per copy of the form, titled by what tells the copies apart (a property, an employer), else the form's own name. */
export function taxFormSections(form: FormWithFields): TaxFormSection[] {
  return form.instances.map(({ fields, ...instance }) => ({
    title: instance.instance_label ?? instance.issuer_name ?? getFormLabel(form.form_name),
    instance,
    data: fields,
  }));
}

/** Where a field's value came from: worked out, overridden by hand, or read from its copy's source. */
export function taxFieldSource(field: TaxFormField, instance: TaxFormInstance): string {
  const mode = taxFieldSourceMode(field);
  if (mode === "calculated") return MESSAGES.calculated;
  if (mode === "overridden") return MESSAGES.overridden;
  return TAX_SOURCE_LABELS[instance.source_type];
}

/** Everything a screen reader needs about a field, in one line. */
export function taxFieldSummary(field: TaxFormField, instance: TaxFormInstance): string {
  return MESSAGES.fieldAccessibility(
    field.label,
    formatTaxFieldValue(field),
    taxFieldSource(field, instance),
    TAX_FIELD_STATUS_LABELS[field.validation_status],
  );
}
