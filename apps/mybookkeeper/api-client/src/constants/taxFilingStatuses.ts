export const FILING_STATUSES = [
  { value: "single", label: "Single" },
  { value: "married_filing_jointly", label: "Married Filing Jointly" },
  { value: "married_filing_separately", label: "Married Filing Separately" },
  { value: "head_of_household", label: "Head of Household" },
  { value: "qualifying_surviving_spouse", label: "Qualifying Surviving Spouse" },
] as const;

export const DEFAULT_FILING_STATUS = "single";
