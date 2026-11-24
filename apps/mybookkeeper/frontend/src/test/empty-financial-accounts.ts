import type { FinancialAccountListResponse } from "@mybookkeeper/api-client/types/financial-account/financial-account-list-response";

/** GET /financial-accounts for someone with no accounts yet. */
export const NO_FINANCIAL_ACCOUNTS: FinancialAccountListResponse = { items: [], totals: [] };

/** What useListFinancialAccountsQuery returns, once loaded, for a test that mocks the module. */
export const EMPTY_FINANCIAL_ACCOUNTS_QUERY = { data: NO_FINANCIAL_ACCOUNTS, isLoading: false, isError: false } as const;
