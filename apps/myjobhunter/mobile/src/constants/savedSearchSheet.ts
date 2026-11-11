/** Copy for the new and edit saved-search sheets, worded as the website's dialogs. */
export const SAVED_SEARCH_SHEET_MESSAGES = {
  newTitle: "New saved search",
  editTitle: "Edit saved search",
  nameLabel: "Name (optional)",
  namePlaceholder: "e.g. 'Stripe backend roles'",
  nameHint: "A label for this search. Required only if you want multiple active searches of the same type — each must have a unique name.",
  sourceLabel: "Job source",
  sourceLocked: "Source kind cannot be changed. Delete and recreate to switch sources.",
  frequencyLabel: "Refresh frequency",
  frequencyHint: "How often this saved search will fetch new postings automatically. You can also refresh on demand from the saved-search list.",
  boardTokenLabel: "Greenhouse board token",
  boardTokenPlaceholder: "e.g. stripe",
  companySlugLabel: "Lever company slug",
  companySlugPlaceholder: "e.g. openai",
  boardKeywordsLabel: "Exclude keywords (optional)",
  greenhouseKeywordsHint:
    "Case-insensitive substring match against title, company, description, and publisher. Salary filtering is not available for Greenhouse sources.",
  leverKeywordsHint:
    "Case-insensitive substring match against title, company, description, and publisher. Salary filtering is not available for Lever sources.",
  keywordsPlaceholder: "junior, intern, ad hoc company name…",
  rolesLabel: "Role(s)",
  rolesPlaceholder: 'e.g. "Senior Backend Engineer"',
  skillsLabel: "Skills (optional)",
  skillsPlaceholder: "Python, FastAPI, PostgreSQL",
  locationLabel: "Location (optional)",
  locationPlaceholder: "City or 'Remote'",
  locationDisabled: "Disabled — you have remote-only on.",
  countryLabel: "Country",
  postedLabel: "Posted",
  employmentLabel: "Employment type",
  experienceLabel: "Experience",
  minSalaryLabel: "Minimum salary (USD, optional)",
  minSalaryPlaceholder: "150000",
  minSalaryHint: "Drops postings below the floor when source posts a salary range. Postings without disclosed salary are kept.",
  industriesLabel: "Exclude industries (one tap skips all related companies + keywords)",
  alsoExcludeLabel: "Also exclude keywords (optional)",
  alsoExcludeHint: "Case-insensitive substring match against title, company, description, publisher.",
  remoteOnly: "Remote jobs only",
  saveAsDefaults: "Save these filters (industries, employment, experience, etc.) as my defaults for new searches",
  prefilled: "Pre-filled from your profile. Edit anything below.",
  loadingPrefill: "Filling this in from your profile",
  create: "Create",
  creating: "Creating…",
  saveChanges: "Save changes",
  saving: "Saving…",
  cancel: "Cancel",
} as const;

/** The words around a field that holds a list, such as roles or keywords. */
export const CHIP_FIELD_MESSAGES = {
  add: "Add",
  addTo: (label: string) => `Add to ${label}`,
  remove: (value: string) => `Remove ${value}`,
  suggest: (value: string) => `Add ${value}`,
  suggestions: "Suggestions",
} as const;

/** Splits what's typed into a list field: a comma ends one entry. */
export const CHIP_FIELD_SEPARATOR = ",";

/** One per field the JSearch form's skeleton shows while the profile fills it in. */
export const PREFILL_SKELETON_FIELDS = ["roles", "skills", "location", "country", "posted"] as const;
