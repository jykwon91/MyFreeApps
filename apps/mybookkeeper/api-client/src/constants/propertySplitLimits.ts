import type { TransactionStatus } from "../types/transaction/TransactionStatus";

/** A split needs at least this many properties; the backend holds the same number (MIN_SPLIT_SHARES). */
export const MIN_SPLIT_PROPERTIES = 2;

/** A duplicate gets merged or deleted, and a personal transfer counts nowhere, so neither is split. */
export const NOT_SPLITTABLE_STATUSES: readonly TransactionStatus[] = ["duplicate", "personal_transfer"];
