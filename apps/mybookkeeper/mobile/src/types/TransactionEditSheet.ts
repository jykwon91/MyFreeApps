import type { TRANSACTION_EDIT_SHEET } from "../constants/transactionEdit";

export type TransactionEditSheet = (typeof TRANSACTION_EDIT_SHEET)[keyof typeof TRANSACTION_EDIT_SHEET];
