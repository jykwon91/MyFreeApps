import type { ValidationResult } from "@/shared/types/tax/validation-result";
import type { FormSummary } from "@/shared/types/tax/form-summary";

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
