import type { BadgeColor } from "@/shared/components/ui/Badge";

export const FORM_TYPE_ORDER = [
  "w2",
  "1099_nec",
  "1099_misc",
  "1099_k",
  "1099_int",
  "1099_div",
  "1099_b",
  "1099_r",
  "1098",
  "k1",
];

const FORM_LABELS: Record<string, string> = {
  w2: "W-2",
  "1099_int": "1099-INT",
  "1099_div": "1099-DIV",
  "1099_k": "1099-K",
  "1099_nec": "1099-NEC",
  "1099_misc": "1099-MISC",
  "1099_b": "1099-B",
  "1099_r": "1099-R",
  "1098": "1098",
  k1: "K-1",
  "1040": "Form 1040",
  schedule_e: "Schedule E",
  schedule_1: "Schedule 1",
  schedule_a: "Schedule A",
  schedule_b: "Schedule B",
  schedule_c: "Schedule C",
  schedule_d: "Schedule D",
  "4562": "Form 4562",
  "8825": "Form 8825",
};

export function getFormLabel(formName: string): string {
  return FORM_LABELS[formName] ?? formName.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export const SOURCE_BADGE: Record<string, { label: string; color: BadgeColor }> = {
  upload: { label: "Upload", color: "blue" },
  email: { label: "Email", color: "gray" },
  api: { label: "API", color: "green" },
};

export function getSourceBadge(source: string): { label: string; color: BadgeColor } {
  return SOURCE_BADGE[source] ?? { label: source, color: "gray" };
}

interface TaxOption {
  value: string;
  label: string;
  description: string;
}

export const TAX_SITUATION_OPTIONS: TaxOption[] = [
  {
    value: "rental_property",
    label: "Rental Properties",
    description: "I own rental properties (Airbnb, long-term tenants)",
  },
  {
    value: "self_employment",
    label: "Self-Employment",
    description: "I'm self-employed, freelance, or do contract work",
  },
  {
    value: "w2_employment",
    label: "W-2 Employment",
    description: "I receive a W-2 from an employer",
  },
  {
    value: "investment",
    label: "Investments",
    description: "I have stocks, crypto, or other investments",
  },
];

export const FILING_STATUS_OPTIONS: TaxOption[] = [
  {
    value: "single",
    label: "Single",
    description: "Unmarried or legally separated",
  },
  {
    value: "married_filing_jointly",
    label: "Married Filing Jointly",
    description: "Married and filing a combined return",
  },
  {
    value: "married_filing_separately",
    label: "Married Filing Separately",
    description: "Married but filing your own return",
  },
  {
    value: "head_of_household",
    label: "Head of Household",
    description: "Unmarried with a qualifying dependent",
  },
  {
    value: "qualifying_surviving_spouse",
    label: "Qualifying Surviving Spouse",
    description: "Widowed with a dependent child",
  },
];
