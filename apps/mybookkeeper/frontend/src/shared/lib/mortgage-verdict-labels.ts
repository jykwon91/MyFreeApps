import type { MortgageRefiVerdict } from "@mybookkeeper/api-client/types/mortgage/mortgage-refi-verdict";

/** Border treatment per verdict — only an actionable card is drawn loudly. */
export const MORTGAGE_VERDICT_BORDER: Record<MortgageRefiVerdict, string> = {
  worth_pricing: "border-orange-500/40 bg-orange-500/5",
  marginal: "border-border",
  no_action: "border-border/50",
  not_checkable: "border-border/50",
};
