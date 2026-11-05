import { TAX_RETURN_STATUS_LABELS } from "@mybookkeeper/api-client/constants/taxReturnLabels";
import type { BadgeColor } from "@/shared/components/ui/Badge";
import type { TaxReturnStatus } from "@mybookkeeper/api-client/types/tax/TaxReturnStatus";

export const STATUS_BADGE: Record<TaxReturnStatus, { label: string; color: BadgeColor }> = {
  draft: { label: TAX_RETURN_STATUS_LABELS.draft, color: "gray" },
  ready: { label: TAX_RETURN_STATUS_LABELS.ready, color: "green" },
  filed: { label: TAX_RETURN_STATUS_LABELS.filed, color: "blue" },
};

export const FILING_STATUSES = [
  { value: "single", label: "Single" },
  { value: "married_filing_jointly", label: "Married Filing Jointly" },
  { value: "married_filing_separately", label: "Married Filing Separately" },
  { value: "head_of_household", label: "Head of Household" },
  { value: "qualifying_surviving_spouse", label: "Qualifying Surviving Spouse" },
];
