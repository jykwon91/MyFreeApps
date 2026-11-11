import type { Education } from "../types/education/education";
import type { EducationFormValues } from "../types/education/education-form-values";

/** The form's starting values: the school being edited, or blank for a new one. */
export function educationFormValues(existing?: Education): EducationFormValues {
  return {
    school: existing?.school ?? "",
    degree: existing?.degree ?? "",
    field: existing?.field ?? "",
    start_year: existing?.start_year?.toString() ?? "",
    end_year: existing?.end_year?.toString() ?? "",
    gpa: existing?.gpa ?? "",
  };
}
