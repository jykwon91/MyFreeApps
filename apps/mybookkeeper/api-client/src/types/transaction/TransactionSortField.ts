/** The columns the server can order the transaction list by. Mirrors the backend's TransactionSortField. */
export type TransactionSortField = "transaction_date" | "amount" | "vendor" | "category" | "status" | "transaction_type";
