import type { SkillCreateRequest } from "../types/skill/skill-create-request";
import type { SkillFormValues } from "../types/skill/skill-form-values";

export function skillCreateRequest(values: SkillFormValues): SkillCreateRequest {
  return {
    name: values.name.trim(),
    years_experience: values.years ? Number.parseInt(values.years, 10) : null,
    category: null,
  };
}
