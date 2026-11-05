/**
 * Mirrors backend `PlaceResponse`. A place is a restaurant recommendation
 * parented directly to the manual (not to a section) — guests browse the
 * flat list via the "Where to Eat" directory.
 */
export interface WelcomeManualPlaceResponse {
  id: string;
  manual_id: string;
  name: string;
  cuisine: string;
  price_tier: "$" | "$$" | "$$$" | null;
  note: string | null;
  map_url: string | null;
  display_order: number;
  created_at: string;
}
