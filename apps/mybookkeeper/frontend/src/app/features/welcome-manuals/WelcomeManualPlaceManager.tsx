import { useState } from "react";
import { Plus } from "lucide-react";
import { LoadingButton, ConfirmDialog } from "@platform/ui";
import { showError, showSuccess } from "@/shared/lib/toast-store";
import {
  NEW_PLACE_DEFAULT_NAME,
  WELCOME_MANUAL_MAX_PLACES,
} from "@/shared/lib/welcome-manual-constants";
import {
  useCreatePlaceMutation,
  useDeletePlaceMutation,
  useUpdatePlaceMutation,
} from "@/shared/store/welcomeManualsApi";
import type { WelcomeManualPlaceResponse } from "@/shared/types/welcome-manual/welcome-manual-place-response";
import WelcomeManualPlaceCard from "./WelcomeManualPlaceCard";

export interface WelcomeManualPlaceManagerProps {
  manualId: string;
  places: WelcomeManualPlaceResponse[];
}

export default function WelcomeManualPlaceManager({
  manualId,
  places,
}: WelcomeManualPlaceManagerProps) {
  const [createPlace, { isLoading: isAdding }] = useCreatePlaceMutation();
  const [deletePlace] = useDeletePlaceMutation();
  const [updatePlace] = useUpdatePlaceMutation();
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const sortedPlaces = [...places].sort((a, b) => a.display_order - b.display_order);
  const atCap = sortedPlaces.length >= WELCOME_MANUAL_MAX_PLACES;
  const cuisineOptions = Array.from(
    new Set(sortedPlaces.map((p) => p.cuisine).filter((c) => c.trim() !== "")),
  ).sort();

  async function handleAdd() {
    if (atCap) return;
    try {
      await createPlace({
        manualId,
        data: { name: NEW_PLACE_DEFAULT_NAME, cuisine: "Other" },
      }).unwrap();
    } catch {
      showError("I couldn't add that place. Want to try again?");
    }
  }

  async function handleConfirmDelete() {
    const placeId = confirmDeleteId;
    if (!placeId) return;
    setConfirmDeleteId(null);
    try {
      await deletePlace({ manualId, placeId }).unwrap();
      showSuccess("Place removed.");
    } catch {
      showError("I couldn't remove that place. Want to try again?");
    }
  }

  async function handlePlaceSave(
    placeId: string,
    changes: {
      name?: string;
      cuisine?: string;
      price_tier?: "$" | "$$" | "$$$" | null;
      note?: string | null;
      map_url?: string | null;
    },
  ) {
    try {
      await updatePlace({ manualId, placeId, ...changes }).unwrap();
    } catch {
      showError("I couldn't save that place. Want to try again?");
    }
  }

  return (
    <div className="space-y-3" data-testid="welcome-manual-place-manager">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">Where to Eat</h2>
          <p className="text-xs text-muted-foreground">
            {atCap
              ? `You've reached the ${WELCOME_MANUAL_MAX_PLACES}-place limit for this manual.`
              : `${sortedPlaces.length} ${sortedPlaces.length === 1 ? "place" : "places"}`}
          </p>
        </div>
        <LoadingButton
          variant="secondary"
          size="sm"
          isLoading={isAdding}
          loadingText="Adding…"
          onClick={handleAdd}
          disabled={atCap}
          type="button"
          data-testid="welcome-manual-place-add-button"
        >
          <Plus className="h-4 w-4 mr-1" />
          Add place
        </LoadingButton>
      </div>

      {sortedPlaces.length === 0 ? (
        <p
          className="text-sm text-muted-foreground border rounded-lg p-6 text-center"
          data-testid="welcome-manual-place-empty-state"
        >
          No places yet. Add restaurants and spots guests should check out.
        </p>
      ) : (
        <ul className="space-y-2 list-none" data-testid="welcome-manual-place-list">
          {sortedPlaces.map((place) => (
            <WelcomeManualPlaceCard
              key={place.id}
              place={place}
              cuisineOptions={cuisineOptions}
              onDelete={() => setConfirmDeleteId(place.id)}
              onNameSave={(name) => void handlePlaceSave(place.id, { name })}
              onCuisineSave={(cuisine) => void handlePlaceSave(place.id, { cuisine })}
              onPriceTierChange={(price_tier) =>
                void handlePlaceSave(place.id, { price_tier })
              }
              onNoteSave={(note) => void handlePlaceSave(place.id, { note: note || null })}
              onMapUrlSave={(mapUrl) =>
                void handlePlaceSave(place.id, { map_url: mapUrl || null })
              }
            />
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={!!confirmDeleteId}
        title="Remove this place?"
        description="The place will be removed from this manual. This can't be undone."
        confirmLabel="Remove"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirmDeleteId(null)}
      />
    </div>
  );
}
