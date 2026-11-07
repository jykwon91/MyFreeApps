export interface RentLedgerArgs {
  applicantId: string;
  /** Evaluate the ledger as of this date (yyyy-MM-dd) instead of the host's local today. */
  asOf?: string;
}
