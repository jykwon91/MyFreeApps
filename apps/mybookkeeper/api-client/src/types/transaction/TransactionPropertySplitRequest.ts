import type { TransactionPropertyShare } from "./TransactionPropertyShare";

/** Exactly one of the two: shares chosen by hand, or "split evenly across these". */
export type TransactionPropertySplitRequest =
  | { shares: TransactionPropertyShare[]; even_across?: never }
  | { even_across: string[]; shares?: never };
