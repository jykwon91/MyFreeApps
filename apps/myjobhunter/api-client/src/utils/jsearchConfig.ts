import type { JSearchFormValues } from "../types/discovery/jsearch-form-values";
import { positiveSalary } from "./positiveSalary";

/** A JSearch saved search's config, as POST and PATCH /discover/sources take it. Optional filters left empty are left out. */
export function jsearchConfig(values: JSearchFormValues): Record<string, unknown> {
  const config: Record<string, unknown> = {
    roles: values.roles,
    skills: values.skills,
    country: values.country,
    date_posted: values.datePosted,
    remote_jobs_only: values.remoteOnly,
  };
  const place = values.location.trim();
  if (place) config.location = place;
  if (values.employmentType) config.employment_type = values.employmentType;
  if (values.experience) config.experience = values.experience;
  const minSalary = positiveSalary(values.minSalary);
  if (minSalary !== null) config.min_salary_usd = minSalary;
  if (values.excludedIndustryChips.length > 0) config.excluded_industry_chips = values.excludedIndustryChips;
  if (values.excludedKeywords.length > 0) config.excluded_keywords = values.excludedKeywords;
  return config;
}
