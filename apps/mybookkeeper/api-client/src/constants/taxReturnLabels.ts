import type { TaxReturnStatus } from "../types/tax/TaxReturnStatus";

export const TAX_RETURN_STATUS_LABELS: Record<TaxReturnStatus, string> = {
  draft: "Draft",
  ready: "Ready",
  filed: "Filed",
};
