import { TAX_RETURN_STATUS_LABELS } from "@mybookkeeper/api-client/constants/taxReturnLabels";
import type { BadgeColor } from "@/shared/components/ui/Badge";
import type { TaxReturnStatus } from "@mybookkeeper/api-client/types/tax/TaxReturnStatus";

export const STATUS_BADGE: Record<TaxReturnStatus, { label: string; color: BadgeColor }> = {
  draft: { label: TAX_RETURN_STATUS_LABELS.draft, color: "gray" },
  ready: { label: TAX_RETURN_STATUS_LABELS.ready, color: "green" },
  filed: { label: TAX_RETURN_STATUS_LABELS.filed, color: "blue" },
};
