/** A "Where to Eat" place as returned by the public (unauthenticated) guide endpoint. */
export interface PublicWelcomeManualPlace {
  name: string;
  cuisine: string;
  price_tier: "$" | "$$" | "$$$" | null;
  note: string | null;
  map_url: string | null;
  display_order: number;
}
