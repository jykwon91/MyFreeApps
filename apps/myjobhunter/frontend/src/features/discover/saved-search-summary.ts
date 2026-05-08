import { INDUSTRY_CHIPS } from "./industry-chips";

/**
 * Render a ``DiscoverySource.config`` object as a short display string
 * for the SavedSearchesPanel row.
 *
 * New configs store ``roles`` (string[]); legacy configs store ``query``
 * (string). Falls back to "(no query)" when neither is present.
 */
export function summarizeSearchQuery(config: Record<string, unknown>): string {
  const roles = config?.roles;
  if (Array.isArray(roles) && roles.length > 0) {
    const validRoles = roles.filter((r): r is string => typeof r === "string");
    if (validRoles.length > 0) return validRoles.join(" / ");
  }
  if (typeof config?.query === "string" && config.query) {
    return config.query;
  }
  return "(no query)";
}

interface SummaryInput {
  roles: string[];
  skills: string[];
  location: string;
  country: string;
  datePosted: string;
  remoteOnly: boolean;
  employmentType: string;
  experience: string;
  minSalary: string;
  excludedIndustryChips: string[];
  excludedKeywords: string[];
}

const DATE_LABELS: Record<string, string> = {
  today: "the past 24 hours",
  "3days": "the past 3 days",
  week: "the past week",
  month: "the past month",
  all: "any time",
};

const COUNTRY_LABELS: Record<string, string> = {
  us: "the US",
  ca: "Canada",
  uk: "the UK",
  au: "Australia",
};

const EMPLOYMENT_LABELS: Record<string, string> = {
  FULLTIME: "full-time",
  CONTRACTOR: "contract",
  PARTTIME: "part-time",
  INTERN: "internship",
};

const EXPERIENCE_LABELS: Record<string, string> = {
  no_experience: "entry-level",
  under_3_years_experience: "under 3 years experience",
  more_than_3_years_experience: "3+ years experience",
  no_degree: "no-degree-required",
};

/**
 * Render a saved-search config as one plain-English sentence the operator
 * reads back before clicking Create.
 *
 * Keep it tight: skip clauses for fields at default values so the output
 * is scannable. The summary updates reactively as form state changes —
 * cheap to compute, no API calls.
 */
export function buildSavedSearchSummary(input: SummaryInput): string {
  const {
    roles,
    skills,
    location,
    country,
    datePosted,
    remoteOnly,
    employmentType,
    experience,
    minSalary,
    excludedIndustryChips,
    excludedKeywords,
  } = input;

  if (roles.length === 0) {
    return "Add at least one role to preview the search.";
  }

  const parts: string[] = [];

  // Lead: "This will search for X / Y / Z roles"
  const roleClause = roles.join(" / ");
  parts.push(`This will search for **${roleClause}** roles`);

  if (skills.length > 0) {
    parts.push(`matching **${skills.join(", ")}**`);
  }

  if (remoteOnly) {
    parts.push("**remote-only**");
  } else if (location.trim()) {
    parts.push(`in **${location.trim()}**`);
  }

  parts.push(`posted in **${DATE_LABELS[datePosted] ?? datePosted}**`);

  parts.push(`in **${COUNTRY_LABELS[country] ?? country.toUpperCase()}**`);

  if (employmentType && EMPLOYMENT_LABELS[employmentType]) {
    parts.push(`(${EMPLOYMENT_LABELS[employmentType]})`);
  }

  if (experience && EXPERIENCE_LABELS[experience]) {
    parts.push(`requiring ${EXPERIENCE_LABELS[experience]}`);
  }

  const minSalaryNum = Number(minSalary);
  if (minSalary && Number.isFinite(minSalaryNum) && minSalaryNum > 0) {
    const formatted = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(minSalaryNum);
    parts.push(`paying **${formatted}**+`);
  }

  // Exclusions clause
  const exclusionLabels: string[] = [];
  for (const chipKey of excludedIndustryChips) {
    const chip = INDUSTRY_CHIPS.find((c) => c.value === chipKey);
    if (chip) exclusionLabels.push(chip.label);
  }
  if (excludedKeywords.length > 0) {
    exclusionLabels.push(`"${excludedKeywords.slice(0, 3).join('", "')}"${
      excludedKeywords.length > 3 ? ` +${excludedKeywords.length - 3} more` : ""
    }`);
  }

  let summary = parts.join(" ") + ".";

  if (exclusionLabels.length > 0) {
    summary += ` Excluding ${exclusionLabels.join(" and ")}.`;
  }

  return summary;
}
