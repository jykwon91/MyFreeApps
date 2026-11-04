/** What the Money tab keeps in its address, so another screen can link straight to a filter. */
export interface MoneyParams extends Record<string, string> {
  segment: string;
  view: string;
  period: string;
  type: string;
  property: string;
  category: string;
}
