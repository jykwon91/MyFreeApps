import type { TransactionStatusOption } from "../types/transaction/TransactionStatusOption";

/** The choices of the transactions Status filter, on the website and the phone. */
export const TRANSACTION_STATUS_OPTIONS: readonly TransactionStatusOption[] = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "needs_review", label: "Needs Review" },
  { value: "duplicate", label: "Duplicate" },
  { value: "unverified", label: "Unverified" },
];
