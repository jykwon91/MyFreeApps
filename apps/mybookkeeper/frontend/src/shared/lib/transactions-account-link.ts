import { isUuid } from "@platform/core/utils/isUuid";

/** The address parameter that opens the Transactions page filtered to one account. */
export const TRANSACTIONS_ACCOUNT_PARAM = "account";

/** The Transactions page showing only one account's rows. */
export function transactionsForAccountPath(accountId: string): string {
  return `/transactions?${new URLSearchParams({ [TRANSACTIONS_ACCOUNT_PARAM]: accountId }).toString()}`;
}

/** The account the address names, or null when it names none or isn't an account id. */
export function accountFromParams(params: URLSearchParams): string | null {
  const value = params.get(TRANSACTIONS_ACCOUNT_PARAM);
  return isUuid(value) ? value : null;
}

/** The same address without the account parameter. */
export function withoutAccountParam(params: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(params);
  next.delete(TRANSACTIONS_ACCOUNT_PARAM);
  return next;
}
