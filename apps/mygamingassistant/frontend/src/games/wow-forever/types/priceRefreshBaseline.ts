/** What the house said when "Refresh now" was clicked: a change in `fetchedAt` or `failedAt` means the refresh finished. */
export interface PriceRefreshBaseline {
  sourceUpdatedAt: string | null;
  fetchedAt: string | null;
  failedAt: string | null;
}
