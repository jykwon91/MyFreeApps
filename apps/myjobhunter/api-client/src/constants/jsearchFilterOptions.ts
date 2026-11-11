import type { Country } from "../types/discovery/country";
import type { DatePosted } from "../types/discovery/date-posted";
import type { EmploymentType } from "../types/discovery/employment-type";
import type { Experience } from "../types/discovery/experience";
import type { LabelledOption } from "../types/discovery/labelled-option";

export const COUNTRY_OPTIONS: readonly LabelledOption<Country>[] = [
  { value: "us", label: "United States" },
  { value: "ca", label: "Canada" },
  { value: "uk", label: "United Kingdom" },
  { value: "au", label: "Australia" },
];

export const DATE_POSTED_OPTIONS: readonly LabelledOption<DatePosted>[] = [
  { value: "today", label: "Past 24 hours" },
  { value: "3days", label: "Past 3 days" },
  { value: "week", label: "Past week" },
  { value: "month", label: "Past month" },
  { value: "all", label: "Any time" },
];

export const EMPLOYMENT_TYPE_OPTIONS: readonly LabelledOption<EmploymentType>[] = [
  { value: "FULLTIME", label: "Full-time" },
  { value: "CONTRACTOR", label: "Contract" },
  { value: "PARTTIME", label: "Part-time" },
  { value: "INTERN", label: "Intern" },
  { value: "", label: "Any" },
];

export const EXPERIENCE_OPTIONS: readonly LabelledOption<Experience>[] = [
  { value: "", label: "Any" },
  { value: "more_than_3_years_experience", label: "3+ years" },
  { value: "under_3_years_experience", label: "Under 3 years" },
  { value: "no_experience", label: "Entry level" },
  { value: "no_degree", label: "No degree required" },
];
