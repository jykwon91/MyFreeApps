const ACCOUNT_PARAM = "account";

/** The account the page is narrowed to, from ``?account=``; null for every account. */
export function holdingsAccountFrom(searchParams: URLSearchParams): string | null {
  const value = searchParams.get(ACCOUNT_PARAM);
  return value === null || value === "" ? null : value;
}

export function holdingsSearchParams(accountId: string | null): URLSearchParams {
  return new URLSearchParams(accountId === null ? {} : { [ACCOUNT_PARAM]: accountId });
}
