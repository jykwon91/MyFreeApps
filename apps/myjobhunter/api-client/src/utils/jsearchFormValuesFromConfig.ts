import { EMPTY_JSEARCH_FORM_VALUES } from "../constants/emptyJSearchFormValues";
import type { Country } from "../types/discovery/country";
import type { DatePosted } from "../types/discovery/date-posted";
import type { EmploymentType } from "../types/discovery/employment-type";
import type { Experience } from "../types/discovery/experience";
import type { JSearchFormValues } from "../types/discovery/jsearch-form-values";

/** A saved JSearch config as the form holds it, with the new-search defaults for anything it lacks. */
export function jsearchFormValuesFromConfig(config: Record<string, unknown>): JSearchFormValues {
  const empty = EMPTY_JSEARCH_FORM_VALUES;
  return {
    roles: (config.roles as string[] | undefined) ?? empty.roles,
    skills: (config.skills as string[] | undefined) ?? empty.skills,
    location: (config.location as string | undefined) ?? empty.location,
    country: (config.country as Country | undefined) ?? empty.country,
    datePosted: (config.date_posted as DatePosted | undefined) ?? empty.datePosted,
    remoteOnly: (config.remote_jobs_only as boolean | undefined) ?? empty.remoteOnly,
    employmentType: (config.employment_type as EmploymentType | undefined) ?? empty.employmentType,
    experience: (config.experience as Experience | undefined) ?? empty.experience,
    minSalary: config.min_salary_usd != null ? String(config.min_salary_usd) : empty.minSalary,
    excludedIndustryChips: (config.excluded_industry_chips as string[] | undefined) ?? empty.excludedIndustryChips,
    excludedKeywords: (config.excluded_keywords as string[] | undefined) ?? empty.excludedKeywords,
  };
}
