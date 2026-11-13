import type { TRANSACTION_SAVE_ACTION } from "../constants/transactionEdit";

export type TransactionSaveAction = (typeof TRANSACTION_SAVE_ACTION)[keyof typeof TRANSACTION_SAVE_ACTION];
