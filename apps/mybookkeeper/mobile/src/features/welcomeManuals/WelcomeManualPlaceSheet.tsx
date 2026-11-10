import {
  WELCOME_MANUAL_PLACE_CUISINE_MAX_LENGTH, WELCOME_MANUAL_PLACE_MAP_URL_MAX_LENGTH, WELCOME_MANUAL_PLACE_NAME_MAX_LENGTH, WELCOME_MANUAL_PLACE_NOTE_MAX_LENGTH,
} from "@mybookkeeper/api-client/constants/welcomeManualLimits";
import { useCreatePlaceMutation, useDeletePlaceMutation, useUpdatePlaceMutation } from "@mybookkeeper/api-client/store/welcomeManualsApi";
import type { WelcomeManualPlaceFormValues } from "@mybookkeeper/api-client/types/welcome-manual/welcome-manual-place-form-values";
import type { WelcomeManualPlaceResponse } from "@mybookkeeper/api-client/types/welcome-manual/welcome-manual-place-response";
import { placeProblems } from "@mybookkeeper/api-client/utils/welcomeManualProblems";
import { placeCreateRequest, placeUpdateRequest } from "@mybookkeeper/api-client/utils/welcomeManualRequests";
import { FormField, SegmentedControl } from "@platform/mobile";
import { WELCOME_MANUAL_PLACE_MESSAGES as MESSAGES, DELETE_PLACE_BODY, deletePlaceTitle } from "../../constants/welcomeManualForms";
import { useSnapshotForm } from "../../lib/useSnapshotForm";
import { cuisineSuggestions } from "@mybookkeeper/api-client/utils/welcomeManualPlaces";
import WelcomeManualCuisineSuggestions from "./WelcomeManualCuisineSuggestions";
import WelcomeManualEditSheet from "./WelcomeManualEditSheet";
import { PRICE_SEGMENTS } from "./welcomeManualPriceSegments";
import { useWelcomeManualItemWrites } from "./useWelcomeManualItemWrites";
import { PLACE_WORDS, PLACE_SHEET_LABELS } from "../../constants/welcomeManualSheets";

interface WelcomeManualPlaceSheetProps {
  manualId: string;
  /** The manual's places, so a cuisine already used can be suggested instead of spelled a second way. */
  places: readonly WelcomeManualPlaceResponse[];
  /** null adds a place. */
  place: WelcomeManualPlaceResponse | null;
  onClose: () => void;
}

export default function WelcomeManualPlaceSheet({ manualId, places, place, onClose }: WelcomeManualPlaceSheetProps) {
  const [createPlace] = useCreatePlaceMutation();
  const [updatePlace] = useUpdatePlaceMutation();
  const [deletePlace] = useDeletePlaceMutation();
  const form = useSnapshotForm<WelcomeManualPlaceFormValues>(
    () => ({ name: place?.name ?? "", cuisine: place?.cuisine ?? "", price_tier: place?.price_tier ?? "", note: place?.note ?? "", map_url: place?.map_url ?? "" }),
    placeProblems,
  );
  const { values, edit } = form;
  const writes = useWelcomeManualItemWrites({
    words: PLACE_WORDS,
    isNew: place === null,
    hasChanges: form.isDirty,
    messages: { added: MESSAGES.added, saved: MESSAGES.saved, deleted: MESSAGES.deleted, alreadyDeleted: MESSAGES.alreadyDeleted },
    create: () => createPlace({ manualId, data: placeCreateRequest(values) }).unwrap(),
    update: () => updatePlace({ manualId, placeId: place?.id ?? "", data: placeUpdateRequest(values, form.dirty) }).unwrap(),
    remove: () => deletePlace({ manualId, placeId: place?.id ?? "" }).unwrap(),
    onDone: onClose,
  });
  const editable = !writes.isBusy;

  return (
    <WelcomeManualEditSheet
      confirmDelete={{ title: deletePlaceTitle(place?.name ?? ""), body: DELETE_PLACE_BODY }}
      failure={writes.failure}
      isBusy={writes.isBusy}
      isDeleting={writes.isDeleting}
      isDirty={form.isDirty}
      isNew={place === null}
      isSaving={writes.isSaving}
      labels={PLACE_SHEET_LABELS}
      onClose={onClose}
      onDelete={() => void writes.destroy()}
      onSave={() => { if (form.validate()) void writes.save(); }}
      title={place ? MESSAGES.edit : MESSAGES.add}
    >
      <FormField editable={editable} error={form.errorFor("name")} label={MESSAGES.nameLabel} maxLength={WELCOME_MANUAL_PLACE_NAME_MAX_LENGTH} onChangeText={(text) => edit("name", text)} required value={values.name} />
      <FormField editable={editable} error={form.errorFor("cuisine")} label={MESSAGES.cuisineLabel} maxLength={WELCOME_MANUAL_PLACE_CUISINE_MAX_LENGTH} onChangeText={(text) => edit("cuisine", text)} required value={values.cuisine} />
      <WelcomeManualCuisineSuggestions onPick={(cuisine) => edit("cuisine", cuisine)} suggestions={editable ? cuisineSuggestions(places, values.cuisine) : []} />
      <SegmentedControl accessibilityLabel={MESSAGES.priceLabel} disabled={!editable} onChange={(tier) => edit("price_tier", tier)} segments={PRICE_SEGMENTS} value={values.price_tier} />
      <FormField editable={editable} error={form.errorFor("note")} label={MESSAGES.noteLabel} maxLength={WELCOME_MANUAL_PLACE_NOTE_MAX_LENGTH} multiline onChangeText={(text) => edit("note", text)} value={values.note} />
      <FormField autoCapitalize="none" editable={editable} error={form.errorFor("map_url")} keyboardType="url" label={MESSAGES.mapLabel} maxLength={WELCOME_MANUAL_PLACE_MAP_URL_MAX_LENGTH} onChangeText={(text) => edit("map_url", text)} placeholder={MESSAGES.mapPlaceholder} value={values.map_url} />
    </WelcomeManualEditSheet>
  );
}
