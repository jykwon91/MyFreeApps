import type { JSearchFormValues } from "../types/discovery/jsearch-form-values";
import type { DiscoveryDefaults } from "../types/profile/discovery-defaults";

/** The profile's discovery defaults with this search's filters saved over them, keeping everything else. */
export function discoveryDefaultsFrom(current: DiscoveryDefaults | undefined, values: JSearchFormValues): DiscoveryDefaults {
  return {
    ...(current ?? {}),
    country: values.country,
    date_posted: values.datePosted,
    employment_type: values.employmentType,
    experience: values.experience,
    excluded_industry_chips: values.excludedIndustryChips,
    excluded_keywords: values.excludedKeywords,
  };
}
