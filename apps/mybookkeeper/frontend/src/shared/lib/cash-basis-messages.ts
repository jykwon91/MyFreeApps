/** What a cash view counts (backend ``cash_basis``), said once for every page that uses it. */
export const CASH_BASIS_MESSAGES = {
  fromBankHistory: (date: string) =>
    `Counts money that moved through your accounts. From ${date}, when your bank history starts, bills and statements with no account are left out — the bank already shows that money.`,
  noBankHistory: "Counts every entry you've recorded. Once a bank is connected, only money through your accounts counts.",
} as const;
