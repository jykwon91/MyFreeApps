import { LISTING_ROOM_TYPE_LABELS, LISTING_STATUS_LABELS } from "@mybookkeeper/api-client/constants/listingLabels";
import { LISTING_TITLE_MAX_LENGTH } from "@mybookkeeper/api-client/constants/listingForm";
import type { ListingFormValues } from "@mybookkeeper/api-client/types/listing/listing-form-values";
import type { ListingResponse } from "@mybookkeeper/api-client/types/listing/listing-response";
import type { ListingRoomType } from "@mybookkeeper/api-client/types/listing/listing-room-type";
import type { ListingStatus } from "@mybookkeeper/api-client/types/listing/listing-status";
import { EMPTY_LISTING_FORM, listingDirtyFields, listingFormProblems, listingToFormValues } from "@mybookkeeper/api-client/utils/listingForm";
import { Banner, FormField, LoadingButton, OptionSheet, PickerField, SwitchRow, useDiscardPrompt, useTheme } from "@platform/mobile";
import { useState } from "react";
import { ScrollView } from "react-native";
import { LISTING_FORM_MESSAGES as MESSAGES, LISTING_MULTILINE_MIN_HEIGHT, LISTING_PROPERTY_CHOICE, LISTING_ROOM_OPTIONS, LISTING_STATUS_OPTIONS } from "../../constants/listingForm";
import type { ListingFormPicking } from "../../types/ListingFormPicking";
import PropertyChoiceField from "../properties/PropertyChoiceField";
import { daysInput, rateInput } from "./listingInput";
import { useSaveListing } from "./useSaveListing";

/** Adds a listing, or changes `original`. What's typed is kept here, and compared with what the form started from, so a reload can't overwrite or revert it. */
export default function ListingFormScreen({ original }: { original: ListingResponse | null }) {
  const { spacing } = useTheme();
  // What the form started from, taken once: a reload of `original` (another device saved) must not read as the person's own edit.
  const [saved] = useState<ListingFormValues>(() => (original ? listingToFormValues(original) : EMPTY_LISTING_FORM));
  const [values, setValues] = useState<ListingFormValues>(saved);
  const [hasTried, setHasTried] = useState(false);
  const [picking, setPicking] = useState<ListingFormPicking>(null);
  const { submit, isBusy, isLeaving, failure } = useSaveListing(original);

  const problems = listingFormProblems(values);
  const isDirty = Object.keys(listingDirtyFields(values, saved)).length > 0;
  const locked = isBusy || isLeaving;
  const errorFor = (field: keyof ListingFormValues) => (hasTried ? problems[field] : undefined);

  useDiscardPrompt(isDirty && !isLeaving, isBusy);

  function edit<Field extends keyof ListingFormValues>(field: Field, value: ListingFormValues[Field]): void {
    setValues((current) => ({ ...current, [field]: value }));
  }

  function save(): void {
    setHasTried(true);
    if (Object.keys(problems).length > 0) return;
    void submit(values, saved);
  }

  const multiline = { minHeight: LISTING_MULTILINE_MIN_HEIGHT, paddingTop: spacing.md, textAlignVertical: "top" } as const;

  return (
    <>
      <ScrollView automaticallyAdjustKeyboardInsets contentContainerStyle={{ gap: spacing.lg, padding: spacing.lg }} contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled">
        {failure ? <Banner message={failure} /> : null}
        <FormField editable={!locked} error={errorFor("title")} label={MESSAGES.title} maxLength={LISTING_TITLE_MAX_LENGTH} onChangeText={(text) => edit("title", text)} required value={values.title} />
        <PropertyChoiceField disabled={locked} error={errorFor("property_id")} messages={LISTING_PROPERTY_CHOICE} onChange={(id) => edit("property_id", id)} value={values.property_id} />
        <FormField editable={!locked} hint={MESSAGES.descriptionHint} inputStyle={multiline} label={MESSAGES.description} multiline onChangeText={(text) => edit("description", text)} value={values.description} />
        <FormField
          editable={!locked}
          error={errorFor("monthly_rate")}
          keyboardType="decimal-pad"
          label={MESSAGES.monthlyRate}
          onChangeText={(text) => edit("monthly_rate", rateInput(text, values.monthly_rate))}
          placeholder={MESSAGES.rateHint}
          required
          value={values.monthly_rate}
        />
        <FormField editable={!locked} error={errorFor("weekly_rate")} keyboardType="decimal-pad" label={MESSAGES.weeklyRate} onChangeText={(text) => edit("weekly_rate", rateInput(text, values.weekly_rate))} value={values.weekly_rate} />
        <FormField editable={!locked} error={errorFor("nightly_rate")} keyboardType="decimal-pad" label={MESSAGES.nightlyRate} onChangeText={(text) => edit("nightly_rate", rateInput(text, values.nightly_rate))} value={values.nightly_rate} />
        <FormField editable={!locked} error={errorFor("min_stay_days")} keyboardType="number-pad" label={MESSAGES.minStay} onChangeText={(text) => edit("min_stay_days", daysInput(text))} value={values.min_stay_days} />
        <FormField editable={!locked} error={errorFor("max_stay_days")} keyboardType="number-pad" label={MESSAGES.maxStay} onChangeText={(text) => edit("max_stay_days", daysInput(text))} value={values.max_stay_days} />
        <PickerField disabled={locked} label={MESSAGES.roomType} onPress={() => setPicking("room")} valueLabel={LISTING_ROOM_TYPE_LABELS[values.room_type]} />
        <PickerField disabled={locked} label={MESSAGES.status} onPress={() => setPicking("status")} valueLabel={LISTING_STATUS_LABELS[values.status]} />
        <SwitchRow disabled={locked} label={MESSAGES.privateBath} onValueChange={(next) => edit("private_bath", next)} value={values.private_bath} />
        <SwitchRow disabled={locked} label={MESSAGES.parking} onValueChange={(next) => edit("parking_assigned", next)} value={values.parking_assigned} />
        <SwitchRow disabled={locked} label={MESSAGES.furnished} onValueChange={(next) => edit("furnished", next)} value={values.furnished} />
        <FormField editable={!locked} error={errorFor("amenities")} hint={MESSAGES.amenitiesHint} label={MESSAGES.amenities} onChangeText={(text) => edit("amenities", text)} value={values.amenities} />
        <SwitchRow disabled={locked} label={MESSAGES.pets} onValueChange={(next) => edit("pets_on_premises", next)} value={values.pets_on_premises} />
        {values.pets_on_premises ? (
          <FormField editable={!locked} hint={MESSAGES.petDisclosureHint} inputStyle={multiline} label={MESSAGES.petDisclosure} multiline onChangeText={(text) => edit("large_dog_disclosure", text)} value={values.large_dog_disclosure} />
        ) : null}
        <LoadingButton disabled={locked} isLoading={isBusy} loadingText={original ? MESSAGES.saving : MESSAGES.adding} onPress={save}>
          {original ? MESSAGES.save : MESSAGES.add}
        </LoadingButton>
      </ScrollView>
      <OptionSheet<ListingRoomType>
        isOpen={picking === "room"}
        onClose={() => setPicking(null)}
        onSelect={(next) => {
          setPicking(null);
          edit("room_type", next);
        }}
        options={LISTING_ROOM_OPTIONS}
        title={MESSAGES.chooseRoomType}
        value={values.room_type}
      />
      <OptionSheet<ListingStatus>
        isOpen={picking === "status"}
        onClose={() => setPicking(null)}
        onSelect={(next) => {
          setPicking(null);
          edit("status", next);
        }}
        options={LISTING_STATUS_OPTIONS}
        title={MESSAGES.chooseStatus}
        value={values.status}
      />
    </>
  );
}
