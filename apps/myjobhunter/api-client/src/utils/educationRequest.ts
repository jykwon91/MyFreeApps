import type { EducationCreateRequest } from "../types/education/education-create-request";
import type { EducationFormValues } from "../types/education/education-form-values";

function yearOrNull(value: string): number | null {
  const trimmed = value.trim();
  return trimmed ? Number.parseInt(trimmed, 10) : null;
}

/** The body for adding a school, and for saving an edit (every field is sent); blanks are sent as null. */
export function educationRequest(values: EducationFormValues): EducationCreateRequest {
  return {
    school: values.school.trim(),
    degree: values.degree.trim() || null,
    field: values.field.trim() || null,
    start_year: yearOrNull(values.start_year),
    end_year: yearOrNull(values.end_year),
    gpa: values.gpa.trim() || null,
  };
}
