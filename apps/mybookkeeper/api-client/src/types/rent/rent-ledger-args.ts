export interface RentLedgerArgs {
  applicantId: string;
  /** Evaluate the ledger as of this date instead of today. */
  asOf?: string;
}
