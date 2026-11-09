import type { FormOverviewItem } from "../types/tax/FormOverviewItem";
import type { FormSummary } from "../types/tax/FormSummary";
import type { ValidationResult } from "../types/tax/ValidationResult";

export function buildFormSummaries(
  formNames: string[],
  instanceCounts: Record<string, number>,
  fieldCounts: Record<string, number>,
  validationResults: ValidationResult[],
): FormSummary[] {
  return formNames.map((form_name) => {
    const formResults = validationResults.filter((v) => v.form_name === form_name);
    return {
      form_name,
      instance_count: instanceCounts[form_name] ?? 0,
      field_count: fieldCounts[form_name] ?? 0,
      error_count: formResults.filter((v) => v.severity === "error").length,
      warning_count: formResults.filter((v) => v.severity === "warning").length,
    };
  });
}

/** One summary per form that has data or a check against it, in the order the overview lists them. */
export function summarizeForms(overview: readonly FormOverviewItem[], validationResults: ValidationResult[]): FormSummary[] {
  const formNames = [...new Set([...overview.map((f) => f.form_name), ...validationResults.map((v) => v.form_name)])];
  const instanceCounts: Record<string, number> = {};
  const fieldCounts: Record<string, number> = {};
  for (const f of overview) {
    instanceCounts[f.form_name] = f.instance_count;
    fieldCounts[f.form_name] = f.field_count;
  }
  return buildFormSummaries(formNames, instanceCounts, fieldCounts, validationResults);
}
