import type { DatePosted } from "../types/discovery/date-posted";
import type { EmploymentType } from "../types/discovery/employment-type";
import type { Experience } from "../types/discovery/experience";
import type { Country } from "../types/discovery/country";
import type { JSearchFormValues } from "../types/discovery/jsearch-form-values";
import type { Profile } from "../types/profile/profile";
import { seniorityToExperience } from "./seniorityToExperience";

/**
 * What a new JSearch saved search starts with from the profile. For each field: the saved
 * discovery defaults first, then a guess from the profile, else the field is left as it is.
 */
export function discoveryPrefill(profile: Profile, roleSuggestions: readonly string[]): Partial<JSearchFormValues> {
  const defaults = profile.discovery_defaults ?? {};
  const prefill: Partial<JSearchFormValues> = { remoteOnly: profile.remote_preference === "remote_only" };
  if (roleSuggestions.length > 0) prefill.roles = [roleSuggestions[0]];
  if (profile.desired_salary_min) {
    const parsed = Number(profile.desired_salary_min);
    if (Number.isFinite(parsed) && parsed > 0) prefill.minSalary = String(Math.floor(parsed));
  }
  if (defaults.country) prefill.country = defaults.country as Country;
  if (defaults.date_posted) prefill.datePosted = defaults.date_posted as DatePosted;
  if (defaults.employment_type !== undefined) prefill.employmentType = defaults.employment_type as EmploymentType;
  prefill.experience = defaults.experience !== undefined ? (defaults.experience as Experience) : seniorityToExperience(profile.seniority);
  if (Array.isArray(defaults.excluded_industry_chips)) prefill.excludedIndustryChips = defaults.excluded_industry_chips;
  if (Array.isArray(defaults.excluded_keywords)) prefill.excludedKeywords = defaults.excluded_keywords;
  return prefill;
}
