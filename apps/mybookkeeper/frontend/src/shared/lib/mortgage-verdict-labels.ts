import type { MortgageRefiVerdict } from "@/shared/types/mortgage/mortgage-refi-verdict";

/**
 * The one line each verdict puts on a loan's card.
 *
 * ``not_checkable`` has no headline: that card shows the specific reason
 * instead, which says more than a label could. A generic "couldn't check this"
 * on top of "this is an ARM, so the fixed-rate survey isn't the right
 * yardstick" would be noise in front of the answer.
 */
export const MORTGAGE_VERDICT_HEADLINE: Record<MortgageRefiVerdict, string> = {
  worth_pricing: "Worth calling a lender about.",
  marginal:
    "Your rate is above the market, but not by enough to cover what refinancing costs.",
  no_action: "Nothing to do — this rate is at or below the market.",
  not_checkable: "",
};

/** Border treatment per verdict — only an actionable card is drawn loudly. */
export const MORTGAGE_VERDICT_BORDER: Record<MortgageRefiVerdict, string> = {
  worth_pricing: "border-orange-500/40 bg-orange-500/5",
  marginal: "border-border",
  no_action: "border-border/50",
  not_checkable: "border-border/50",
};
