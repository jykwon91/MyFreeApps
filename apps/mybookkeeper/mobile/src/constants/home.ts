import type { TransactionPeriod } from "../types/TransactionPeriod";

export type HomePeriod = Extract<TransactionPeriod, "thisMonth" | "thisYear">;

export const HOME_PERIODS: readonly { value: HomePeriod; label: string }[] = [
  { value: "thisMonth", label: "This month" },
  { value: "thisYear", label: "This year" },
];

export const PROPERTIES_SHOWN_AT_FIRST = 5;
export const DOCUMENTS_NEEDING_A_LOOK_LINK = "/money?segment=documents&filter=needsALook";
export const MONEY_ANALYSIS_LINK = "/analytics/money";
export const RECEIPTS_LINK = "/receipts";
export const INTEGRATIONS_LINK = "/integrations";
export const GMAIL_REAUTH_WAITING = "Gmail needs you to sign in again";
/** Home only needs the count, which comes with any page. */
export const HOME_RECEIPTS_ARGS = { limit: 1 };
export const PAYMENT_REVIEW_LINK = "/payment-review";
// Only the count is wanted, so one row is plenty.
export const HOME_PAYMENT_REVIEW_ARGS = { limit: 1 };
export const UTILITY_RENEWALS_LINK = "/utility-plans/renewals";
export const UTILITY_RATE_CHECK_LINK = "/utility-plans/rate-check";
export const INSURANCE_LINK = "/insurance";
export const HOME_CHART_HEIGHT = 160;
export const HOME_CHART_MONTHS = 6;
export const HOME_TOP_CATEGORIES = 5;
export const HOME_CATEGORY_BAR_HEIGHT = 8;
/** One per category row, then one for "See all expenses". */
export const HOME_CATEGORY_SKELETON_ROWS = ["a", "b", "c", "d", "e", "see-all"];
