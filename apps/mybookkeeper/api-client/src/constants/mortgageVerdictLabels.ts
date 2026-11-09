import type { MortgageRefiVerdict } from "../types/mortgage/mortgage-refi-verdict";

/**
 * The one line each verdict puts on a loan's card.
 *
 * ``not_checkable`` has no headline: that card shows the specific reason
 * instead, which says more than a label could.
 */
export const MORTGAGE_VERDICT_HEADLINE: Record<MortgageRefiVerdict, string> = {
  worth_pricing: "Worth calling a lender about.",
  marginal:
    "Your rate is above the market, but not by enough to cover what refinancing costs.",
  no_action: "Nothing to do — this rate is at or below the market.",
  not_checkable: "",
};
