/** How the saved-search summary sentence words each JSearch filter value. */
export const SUMMARY_DATE_LABELS: Record<string, string> = {
  today: "the past 24 hours",
  "3days": "the past 3 days",
  week: "the past week",
  month: "the past month",
  all: "any time",
};

export const SUMMARY_COUNTRY_LABELS: Record<string, string> = {
  us: "the US",
  ca: "Canada",
  uk: "the UK",
  au: "Australia",
};

export const SUMMARY_EMPLOYMENT_LABELS: Record<string, string> = {
  FULLTIME: "full-time",
  CONTRACTOR: "contract",
  PARTTIME: "part-time",
  INTERN: "internship",
};

export const SUMMARY_EXPERIENCE_LABELS: Record<string, string> = {
  no_experience: "entry-level",
  under_3_years_experience: "under 3 years experience",
  more_than_3_years_experience: "3+ years experience",
  no_degree: "no-degree-required",
};

/** How many excluded keywords the summary names before saying "+N more". */
export const SUMMARY_KEYWORDS_SHOWN = 3;
