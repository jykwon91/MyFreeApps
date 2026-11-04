import type { TransactionPeriod } from "../types/TransactionPeriod";

export type HomePeriod = Extract<TransactionPeriod, "thisMonth" | "thisYear">;

export const HOME_PERIODS: readonly { value: HomePeriod; label: string }[] = [
  { value: "thisMonth", label: "This month" },
  { value: "thisYear", label: "This year" },
];

export const PROPERTIES_SHOWN_AT_FIRST = 5;
export const DOCUMENTS_NEEDING_A_LOOK_LINK = "/money?segment=documents&filter=needsALook";
