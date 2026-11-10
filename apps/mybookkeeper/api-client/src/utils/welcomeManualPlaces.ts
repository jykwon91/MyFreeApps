import { WELCOME_MANUAL_PRICE_TIERS } from "../constants/welcomeManualLimits";
import type { WelcomeManualPlaceFilters } from "../types/welcome-manual/welcome-manual-place-filters";
import type { WelcomeManualPlaceGroup } from "../types/welcome-manual/welcome-manual-place-group";
import type { WelcomeManualPlaceResponse } from "../types/welcome-manual/welcome-manual-place-response";
import type { WelcomeManualPriceTier } from "../types/welcome-manual/welcome-manual-price-tier";

export const NO_PLACE_FILTERS: WelcomeManualPlaceFilters = { search: "", cuisine: null, priceTier: null };

/** Every cuisine the places use, once each, in order. */
export function placeCuisines(places: readonly WelcomeManualPlaceResponse[]): string[] {
  return Array.from(new Set(places.map((place) => place.cuisine))).sort();
}

/** The price tiers some place carries, cheapest first. */
export function placePriceTiers(places: readonly WelcomeManualPlaceResponse[]): WelcomeManualPriceTier[] {
  return WELCOME_MANUAL_PRICE_TIERS.filter((tier) => places.some((place) => place.price_tier === tier));
}

/** Search looks at the name, the cuisine and the note; the cuisine and price tier must match exactly. */
export function filterPlaces(places: readonly WelcomeManualPlaceResponse[], filters: WelcomeManualPlaceFilters): WelcomeManualPlaceResponse[] {
  const query = filters.search.trim().toLowerCase();
  return places.filter((place) => {
    const matchesSearch =
      !query || place.name.toLowerCase().includes(query) || place.cuisine.toLowerCase().includes(query) || (place.note ?? "").toLowerCase().includes(query);
    return matchesSearch && (!filters.cuisine || place.cuisine === filters.cuisine) && (!filters.priceTier || place.price_tier === filters.priceTier);
  });
}

/** One group per cuisine, in order, each keeping the places' own order. */
export function groupPlacesByCuisine(places: readonly WelcomeManualPlaceResponse[]): WelcomeManualPlaceGroup[] {
  const groups = new Map<string, WelcomeManualPlaceResponse[]>();
  for (const place of places) groups.set(place.cuisine, [...(groups.get(place.cuisine) ?? []), place]);
  return Array.from(groups.keys())
    .sort()
    .map((cuisine) => ({ cuisine, places: groups.get(cuisine) ?? [] }));
}

/** Cuisines already used that start the way the host is typing, so one name isn't spelled two ways. Nothing once it matches exactly. */
export function cuisineSuggestions(places: readonly WelcomeManualPlaceResponse[], typed: string): string[] {
  const query = typed.trim().toLowerCase();
  return placeCuisines(places).filter((cuisine) => {
    const name = cuisine.trim().toLowerCase();
    return name !== "" && name !== query && (query === "" || name.includes(query));
  });
}
