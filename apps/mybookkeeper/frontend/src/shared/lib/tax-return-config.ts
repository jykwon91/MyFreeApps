import type { BadgeColor } from "@/shared/components/ui/Badge";
import type { TaxReturnStatus } from "@/shared/types/tax/tax-return";

export const STATUS_BADGE: Record<TaxReturnStatus, { label: string; color: BadgeColor }> = {
  draft: { label: "Draft", color: "gray" },
  ready: { label: "Ready", color: "green" },
  filed: { label: "Filed", color: "blue" },
};

export const FILING_STATUSES = [
  { value: "single", label: "Single" },
  { value: "married_filing_jointly", label: "Married Filing Jointly" },
  { value: "married_filing_separately", label: "Married Filing Separately" },
  { value: "head_of_household", label: "Head of Household" },
  { value: "qualifying_surviving_spouse", label: "Qualifying Surviving Spouse" },
];
