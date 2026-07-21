import { useState } from "react";
import { MapPin } from "lucide-react";
import { WELCOME_MANUAL_PRICE_TIERS } from "@/shared/lib/welcome-manual-constants";
import type { WelcomeManualPlaceResponse } from "@/shared/types/welcome-manual/welcome-manual-place-response";

export interface WelcomeManualPlaceDirectoryProps {
  places: WelcomeManualPlaceResponse[];
}

function buildMapHref(place: WelcomeManualPlaceResponse): string {
  // Only trust http(s) URLs — never emit a stored ``javascript:``/``data:``
  // scheme into an href. Anything else falls back to a name search.
  if (place.map_url && /^https?:\/\//i.test(place.map_url)) return place.map_url;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.name)}`;
}

/**
 * Guest-facing "Where to Eat" directory rendered in the welcome-manual
 * preview. Read-only — filtering happens entirely client-side over the
 * places already loaded with the manual.
 */
export default function WelcomeManualPlaceDirectory({
  places,
}: WelcomeManualPlaceDirectoryProps) {
  const [search, setSearch] = useState("");
  const [selectedCuisine, setSelectedCuisine] = useState<string | null>(null);
  const [selectedPriceTier, setSelectedPriceTier] = useState<"$" | "$$" | "$$$" | null>(null);

  if (places.length === 0) return null;

  const cuisines = Array.from(new Set(places.map((p) => p.cuisine))).sort();
  const priceTiers = WELCOME_MANUAL_PRICE_TIERS.filter((tier) =>
    places.some((p) => p.price_tier === tier),
  );

  const query = search.trim().toLowerCase();
  const filteredPlaces = places.filter((place) => {
    const matchesSearch =
      !query ||
      place.name.toLowerCase().includes(query) ||
      place.cuisine.toLowerCase().includes(query) ||
      (place.note ?? "").toLowerCase().includes(query);
    const matchesCuisine = !selectedCuisine || place.cuisine === selectedCuisine;
    const matchesPriceTier = !selectedPriceTier || place.price_tier === selectedPriceTier;
    return matchesSearch && matchesCuisine && matchesPriceTier;
  });

  const groups = new Map<string, WelcomeManualPlaceResponse[]>();
  for (const place of filteredPlaces) {
    const list = groups.get(place.cuisine) ?? [];
    list.push(place);
    groups.set(place.cuisine, list);
  }
  const sortedCuisineKeys = Array.from(groups.keys()).sort();

  return (
    <section
      className="space-y-3"
      data-testid="welcome-manual-place-directory"
    >
      <h2 className="text-base font-semibold text-foreground border-b pb-1">Where to Eat</h2>

      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search restaurants, cuisine, or notes…"
        className="w-full border rounded-md px-3 py-2 text-sm min-h-[44px]"
        aria-label="Search restaurants"
        data-testid="welcome-manual-place-directory-search"
      />

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by cuisine">
        <button
          type="button"
          aria-pressed={selectedCuisine === null}
          onClick={() => setSelectedCuisine(null)}
          className={`min-h-[44px] px-3 rounded-full border text-sm font-medium ${
            selectedCuisine === null
              ? "bg-primary text-primary-foreground border-primary"
              : "text-muted-foreground hover:text-foreground"
          }`}
          data-testid="welcome-manual-place-directory-genre-chip"
        >
          All
        </button>
        {cuisines.map((cuisine) => {
          const isActive = selectedCuisine === cuisine;
          return (
            <button
              key={cuisine}
              type="button"
              aria-pressed={isActive}
              onClick={() => setSelectedCuisine(isActive ? null : cuisine)}
              className={`min-h-[44px] px-3 rounded-full border text-sm font-medium ${
                isActive
                  ? "bg-primary text-primary-foreground border-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              data-testid="welcome-manual-place-directory-genre-chip"
            >
              {cuisine}
            </button>
          );
        })}
      </div>

      {priceTiers.length > 0 ? (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by price">
          {priceTiers.map((tier) => {
            const isActive = selectedPriceTier === tier;
            return (
              <button
                key={tier}
                type="button"
                aria-pressed={isActive}
                onClick={() => setSelectedPriceTier(isActive ? null : tier)}
                className={`min-h-[44px] min-w-[44px] px-3 rounded-full border text-sm font-medium ${
                  isActive
                    ? "bg-primary text-primary-foreground border-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                data-testid="welcome-manual-place-directory-price-chip"
              >
                {tier}
              </button>
            );
          })}
        </div>
      ) : null}

      {filteredPlaces.length === 0 ? (
        <p
          className="text-sm text-muted-foreground text-center py-4"
          data-testid="welcome-manual-place-directory-no-matches"
        >
          No places match your filters.
        </p>
      ) : (
        <div className="space-y-4">
          {sortedCuisineKeys.map((cuisine) => (
            <div key={cuisine} data-testid="welcome-manual-place-directory-group">
              <h3 className="text-sm font-semibold text-foreground mb-2">{cuisine}</h3>
              <ul className="space-y-2 list-none">
                {(groups.get(cuisine) ?? []).map((place) => (
                  <li
                    key={place.id}
                    className="border rounded-lg p-3 space-y-1"
                    data-testid="welcome-manual-place-directory-item"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-foreground">{place.name}</span>
                      {place.price_tier ? (
                        <span className="text-xs font-medium text-muted-foreground border rounded-full px-2 py-0.5">
                          {place.price_tier}
                        </span>
                      ) : null}
                    </div>
                    {place.note ? (
                      <p className="text-sm text-muted-foreground">{place.note}</p>
                    ) : null}
                    <a
                      href={buildMapHref(place)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-sm text-primary hover:underline min-h-[44px]"
                    >
                      <MapPin className="h-4 w-4" aria-hidden="true" />
                      Map
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
