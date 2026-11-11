import type { JSearchFormValues } from "../types/discovery/jsearch-form-values";

/** A new JSearch saved search before the profile fills anything in. */
export const EMPTY_JSEARCH_FORM_VALUES: JSearchFormValues = {
  roles: [],
  skills: [],
  location: "",
  country: "us",
  datePosted: "week",
  remoteOnly: false,
  employmentType: "FULLTIME",
  experience: "",
  minSalary: "",
  excludedIndustryChips: [],
  excludedKeywords: [],
};
