import { X } from "lucide-react";
import { WELCOME_MANUAL_PRICE_TIERS } from "@/shared/lib/welcome-manual-constants";
import type { WelcomeManualPlaceResponse } from "@/shared/types/welcome-manual/welcome-manual-place-response";

export interface WelcomeManualPlaceCardProps {
  place: WelcomeManualPlaceResponse;
  cuisineOptions: readonly string[];
  onDelete: () => void;
  onNameSave: (name: string) => void;
  onCuisineSave: (cuisine: string) => void;
  onPriceTierChange: (priceTier: "$" | "$$" | "$$$" | null) => void;
  onNoteSave: (note: string) => void;
  onMapUrlSave: (mapUrl: string) => void;
}

const inputClass =
  "flex-1 min-w-0 border rounded-md px-2 py-2 text-sm min-h-[44px] bg-transparent focus:outline-none focus:bg-muted/40";

export default function WelcomeManualPlaceCard({
  place,
  cuisineOptions,
  onDelete,
  onNameSave,
  onCuisineSave,
  onPriceTierChange,
  onNoteSave,
  onMapUrlSave,
}: WelcomeManualPlaceCardProps) {
  const cuisineListId = `welcome-manual-place-cuisine-list-${place.id}`;

  function handleNameBlur(e: React.FocusEvent<HTMLInputElement>) {
    const trimmed = e.target.value.trim();
    if (trimmed === place.name) return;
    onNameSave(trimmed);
  }

  function handleCuisineBlur(e: React.FocusEvent<HTMLInputElement>) {
    const trimmed = e.target.value.trim();
    if (trimmed === place.cuisine) return;
    onCuisineSave(trimmed);
  }

  function handleNoteBlur(e: React.FocusEvent<HTMLInputElement>) {
    const trimmed = e.target.value.trim();
    if (trimmed === (place.note ?? "")) return;
    onNoteSave(trimmed);
  }

  function handleMapUrlBlur(e: React.FocusEvent<HTMLInputElement>) {
    const trimmed = e.target.value.trim();
    if (trimmed === (place.map_url ?? "")) return;
    onMapUrlSave(trimmed);
  }

  function handlePriceTierClick(tier: "$" | "$$" | "$$$") {
    onPriceTierChange(place.price_tier === tier ? null : tier);
  }

  return (
    <li
      className="border rounded-lg p-3 space-y-2 bg-card"
      data-testid="welcome-manual-place-card"
      data-place-id={place.id}
    >
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0 space-y-2">
          {/* Uncontrolled: ``key`` re-mounts each input when the server value
              changes (after a successful save or a revert) so the displayed
              value re-baselines without a setState-in-effect. Edits live in
              the DOM and are read on blur. */}
          <input
            key={`name-${place.name}`}
            defaultValue={place.name}
            onBlur={handleNameBlur}
            placeholder="Restaurant name"
            className={`${inputClass} font-medium`}
            aria-label="Restaurant name"
            data-testid="welcome-manual-place-name"
          />

          <div className="flex flex-wrap items-center gap-2">
            <input
              key={`cuisine-${place.cuisine}`}
              defaultValue={place.cuisine}
              onBlur={handleCuisineBlur}
              placeholder="Cuisine"
              list={cuisineListId}
              className={inputClass}
              aria-label="Cuisine"
              data-testid="welcome-manual-place-cuisine"
            />
            <datalist id={cuisineListId}>
              {cuisineOptions.map((cuisine) => (
                <option key={cuisine} value={cuisine} />
              ))}
            </datalist>

            <div className="flex gap-1" role="group" aria-label="Price tier">
              {WELCOME_MANUAL_PRICE_TIERS.map((tier) => {
                const isActive = place.price_tier === tier;
                return (
                  <button
                    key={tier}
                    type="button"
                    aria-pressed={isActive}
                    onClick={() => handlePriceTierClick(tier)}
                    className={`min-h-[44px] min-w-[44px] px-2 rounded-md border text-sm font-medium ${
                      isActive
                        ? "bg-primary text-primary-foreground border-primary"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                    data-testid="welcome-manual-place-price-tier-button"
                  >
                    {tier}
                  </button>
                );
              })}
            </div>
          </div>

          <input
            key={`note-${place.note ?? ""}`}
            defaultValue={place.note ?? ""}
            onBlur={handleNoteBlur}
            placeholder="Note (what to order, tips, etc.)"
            className={inputClass}
            aria-label="Note"
            data-testid="welcome-manual-place-note"
          />

          <input
            key={`map-url-${place.map_url ?? ""}`}
            defaultValue={place.map_url ?? ""}
            onBlur={handleMapUrlBlur}
            placeholder="Google Maps link"
            className={inputClass}
            aria-label="Map link"
            data-testid="welcome-manual-place-map-url"
          />
        </div>

        <button
          type="button"
          onClick={onDelete}
          className="text-red-600 hover:bg-red-50 rounded p-1 min-h-[44px] min-w-[44px] flex items-center justify-center"
          aria-label={`Remove place ${place.name}`}
          data-testid="welcome-manual-place-delete-button"
        >
          <X size={16} />
        </button>
      </div>
    </li>
  );
}
