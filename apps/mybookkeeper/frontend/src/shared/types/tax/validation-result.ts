export type ValidationSeverity = "error" | "warning" | "info";

export interface ValidationResult {
  severity: ValidationSeverity;
  form_name: string;
  field_id: string | null;
  message: string;
  expected_value: number | null;
  actual_value: number | null;
}
