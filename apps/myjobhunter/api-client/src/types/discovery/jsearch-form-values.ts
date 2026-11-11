import type { Country } from "./country";
import type { DatePosted } from "./date-posted";
import type { EmploymentType } from "./employment-type";
import type { Experience } from "./experience";

/** What a JSearch saved search asks for, as its form holds it: `minSalary` is the typed text. */
export interface JSearchFormValues {
  roles: string[];
  skills: string[];
  location: string;
  country: Country;
  datePosted: DatePosted;
  remoteOnly: boolean;
  employmentType: EmploymentType;
  experience: Experience;
  minSalary: string;
  excludedIndustryChips: string[];
  excludedKeywords: string[];
}
