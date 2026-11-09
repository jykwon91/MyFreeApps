import type { TransactionPeriod } from "../types/TransactionPeriod";

export type HomePeriod = Extract<TransactionPeriod, "thisMonth" | "thisYear">;

export const HOME_PERIODS: readonly { value: HomePeriod; label: string }[] = [
  { value: "thisMonth", label: "This month" },
  { value: "thisYear", label: "This year" },
];

export const PROPERTIES_SHOWN_AT_FIRST = 5;
export const DOCUMENTS_NEEDING_A_LOOK_LINK = "/money?segment=documents&filter=needsALook";
export const RECEIPTS_LINK = "/receipts";
/** Home only needs the count, which comes with any page. */
export const HOME_RECEIPTS_ARGS = { limit: 1 };
export const UTILITY_PLANS_LINK = "/utility-plans";
export const INSURANCE_LINK = "/insurance";
export const HOME_CHART_HEIGHT = 160;
export const HOME_CHART_MONTHS = 6;
export const HOME_TOP_CATEGORIES = 5;
export const HOME_CATEGORY_BAR_HEIGHT = 8;
/** One per category row, then one for "See all expenses". */
export const HOME_CATEGORY_SKELETON_ROWS = ["a", "b", "c", "d", "e", "see-all"];
