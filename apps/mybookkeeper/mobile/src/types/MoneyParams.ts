/** What the Money tab keeps in its address, so another screen can link straight to a filter. */
export interface MoneyParams extends Record<string, string> {
  segment: string;
  /** Which documents to show. */
  filter: string;
  view: string;
  period: string;
  type: string;
  property: string;
  category: string;
  vendor: string;
  status: string;
}
