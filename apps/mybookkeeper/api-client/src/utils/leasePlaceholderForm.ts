import { LEASE_PLACEHOLDER_DEFAULT_SOURCE_MAX_LENGTH, LEASE_PLACEHOLDER_LABEL_MAX_LENGTH } from "../constants/leasePlaceholderForm";
import type { LeasePlaceholderFormField } from "../types/lease/lease-placeholder-form-field";
import type { LeasePlaceholderFormProblems } from "../types/lease/lease-placeholder-form-problems";
import type { LeasePlaceholderFormValues } from "../types/lease/lease-placeholder-form-values";
import type { LeasePlaceholderUpdateRequest } from "../types/lease/lease-placeholder-update-request";
import type { LeaseTemplatePlaceholder } from "../types/lease/lease-template-placeholder";

export function placeholderToFormValues(placeholder: LeaseTemplatePlaceholder): LeasePlaceholderFormValues {
  return {
    display_label: placeholder.display_label,
    input_type: placeholder.input_type,
    required: placeholder.required,
    default_source: placeholder.default_source ?? "",
    computed_expr: placeholder.computed_expr ?? "",
  };
}

/** The values as they would be saved: text is trimmed, and an expression the form hides (the type isn't computed) stays as it started. */
function savedValues(values: LeasePlaceholderFormValues, started: LeasePlaceholderFormValues): LeasePlaceholderFormValues {
  return {
    ...values,
    display_label: values.display_label.trim(),
    default_source: values.default_source.trim(),
    computed_expr: values.input_type === "computed" ? values.computed_expr.trim() : started.computed_expr,
  };
}

/** The fields whose saved value differs from what the form started from. */
export function placeholderDirtyFields(values: LeasePlaceholderFormValues, started: LeasePlaceholderFormValues): LeasePlaceholderFormField[] {
  const now = savedValues(values, started);
  const was = savedValues(started, started);
  return (Object.keys(now) as LeasePlaceholderFormField[]).filter((field) => now[field] !== was[field]);
}

/** Only the named fields, trimmed. A cleared default or expression is sent as null, which is how the server clears it. */
export function placeholderUpdateRequest(values: LeasePlaceholderFormValues, fields: readonly LeasePlaceholderFormField[]): LeasePlaceholderUpdateRequest {
  const request: LeasePlaceholderUpdateRequest = {};
  for (const field of fields) {
    if (field === "display_label") request.display_label = values.display_label.trim();
    else if (field === "input_type") request.input_type = values.input_type;
    else if (field === "required") request.required = values.required;
    else if (field === "default_source") request.default_source = values.default_source.trim() === "" ? null : values.default_source.trim();
    else request.computed_expr = values.computed_expr.trim() === "" ? null : values.computed_expr.trim();
  }
  return request;
}

/** What stops the form from being saved, judged on the trimmed text. The server's own checks on the default and expression come back when it's sent. */
export function placeholderFormProblems(values: LeasePlaceholderFormValues): LeasePlaceholderFormProblems {
  const problems: LeasePlaceholderFormProblems = {};
  const label = values.display_label.trim();
  if (label === "") problems.display_label = "label_required";
  else if (label.length > LEASE_PLACEHOLDER_LABEL_MAX_LENGTH) problems.display_label = "label_too_long";
  if (values.default_source.trim().length > LEASE_PLACEHOLDER_DEFAULT_SOURCE_MAX_LENGTH) problems.default_source = "default_source_too_long";
  return problems;
}
