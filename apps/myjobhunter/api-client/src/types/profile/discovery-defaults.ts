export interface DiscoveryDefaults {
  excluded_industry_chips?: string[];
  excluded_keywords?: string[];
  employment_type?: string;
  experience?: string;
  country?: string;
  date_posted?: string;
  // Phase C scoring inputs (written by Phase C).
  preferred_industries?: string[];
  preferred_stack?: string[];
  rejected_stack?: string[];
}
