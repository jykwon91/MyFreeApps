/** What to tell the person after refreshing a saved search. */
export interface RefreshOutcome {
  message: string;
  isError: boolean;
  /** The fetch added postings, so they are being scored; even a partial fetch can. */
  addedPostings: boolean;
}
