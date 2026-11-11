import { INDUSTRY_CHIPS } from "../constants/industryChips";
import {
  SUMMARY_COUNTRY_LABELS,
  SUMMARY_DATE_LABELS,
  SUMMARY_EMPLOYMENT_LABELS,
  SUMMARY_EXPERIENCE_LABELS,
  SUMMARY_KEYWORDS_SHOWN,
} from "../constants/savedSearchSummaryLabels";
import type { JSearchFormValues } from "../types/discovery/jsearch-form-values";
import { positiveSalary } from "./positiveSalary";

/**
 * A JSearch saved search as one plain-English sentence to read back before saving it, with the
 * chosen values in **bold**. Filters left at their defaults are skipped to keep it scannable.
 */
export function buildSavedSearchSummary(values: JSearchFormValues): string {
  if (values.roles.length === 0) return "Add at least one role to preview the search.";

  const parts = [`This will search for **${values.roles.join(" / ")}** roles`];
  if (values.skills.length > 0) parts.push(`matching **${values.skills.join(", ")}**`);
  if (values.remoteOnly) parts.push("**remote-only**");
  else if (values.location.trim()) parts.push(`in **${values.location.trim()}**`);
  parts.push(`posted in **${SUMMARY_DATE_LABELS[values.datePosted] ?? values.datePosted}**`);
  parts.push(`in **${SUMMARY_COUNTRY_LABELS[values.country] ?? values.country.toUpperCase()}**`);
  const employment = SUMMARY_EMPLOYMENT_LABELS[values.employmentType];
  if (values.employmentType && employment) parts.push(`(${employment})`);
  const experience = SUMMARY_EXPERIENCE_LABELS[values.experience];
  if (values.experience && experience) parts.push(`requiring ${experience}`);
  const minSalary = positiveSalary(values.minSalary);
  if (minSalary !== null) {
    // The typed amount, not rounded down, as the sentence reads back what was entered.
    const formatted = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(Number(values.minSalary));
    parts.push(`paying **${formatted}**+`);
  }

  const exclusions = values.excludedIndustryChips.flatMap((key) => INDUSTRY_CHIPS.filter((chip) => chip.value === key).map((chip) => chip.label));
  const keywords = values.excludedKeywords;
  if (keywords.length > 0) {
    const more = keywords.length > SUMMARY_KEYWORDS_SHOWN ? ` +${keywords.length - SUMMARY_KEYWORDS_SHOWN} more` : "";
    exclusions.push(`"${keywords.slice(0, SUMMARY_KEYWORDS_SHOWN).join('", "')}"${more}`);
  }

  const summary = `${parts.join(" ")}.`;
  return exclusions.length > 0 ? `${summary} Excluding ${exclusions.join(" and ")}.` : summary;
}
