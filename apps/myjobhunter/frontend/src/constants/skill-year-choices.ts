import { SKILL_YEAR_OPTIONS } from "@myjobhunter/api-client/constants/skillYearOptions";

/** The add-skill form's years select, led by a blank choice for "not set". */
export const SKILL_YEAR_CHOICES = [{ value: "", label: "— yrs —" }, ...SKILL_YEAR_OPTIONS] as const;
