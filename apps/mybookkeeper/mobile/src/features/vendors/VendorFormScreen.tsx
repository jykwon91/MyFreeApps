import { VENDOR_ADDRESS_MAX_LENGTH, VENDOR_EMAIL_MAX_LENGTH, VENDOR_NAME_MAX_LENGTH, VENDOR_PHONE_MAX_LENGTH } from "@mybookkeeper/api-client/constants/vendorForm";
import { VENDOR_CATEGORIES, VENDOR_CATEGORY_LABELS } from "@mybookkeeper/api-client/constants/vendorLabels";
import type { VendorCategory } from "@mybookkeeper/api-client/types/vendor/vendor-category";
import type { VendorFormValues } from "@mybookkeeper/api-client/types/vendor/vendor-form-values";
import type { VendorResponse } from "@mybookkeeper/api-client/types/vendor/vendor-response";
import { EMPTY_VENDOR_FORM, vendorDirtyFields, vendorFormProblems, vendorToFormValues } from "@mybookkeeper/api-client/utils/vendorForm";
import { Banner, FormField, LoadingButton, OptionSheet, PickerField, SwitchRow, useDiscardPrompt, useTheme } from "@platform/mobile";
import { useState } from "react";
import { ScrollView } from "react-native";
import { VENDOR_FORM_MESSAGES as MESSAGES } from "../../constants/vendorForm";
import { useSaveVendor } from "./useSaveVendor";

const CATEGORY_OPTIONS = VENDOR_CATEGORIES.map((category) => ({ value: category, label: VENDOR_CATEGORY_LABELS[category] }));
const NOTES_MIN_HEIGHT = 96;

/** Adds a vendor, or changes `original`. What's typed is kept here, so a reload can't overwrite it. */
export default function VendorFormScreen({ original }: { original: VendorResponse | null }) {
  const { spacing } = useTheme();
  const saved = original ? vendorToFormValues(original) : EMPTY_VENDOR_FORM;
  const [values, setValues] = useState<VendorFormValues>(saved);
  const [hasTried, setHasTried] = useState(false);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const { submit, isBusy, isLeaving, failure } = useSaveVendor(original);

  const problems = vendorFormProblems(values);
  const isDirty = Object.keys(vendorDirtyFields(values, saved)).length > 0;
  const locked = isBusy || isLeaving;
  const errorFor = (field: keyof VendorFormValues) => (hasTried ? problems[field] : undefined);

  useDiscardPrompt(isDirty && !isLeaving, isBusy);

  function edit<Field extends keyof VendorFormValues>(field: Field, value: VendorFormValues[Field]): void {
    setValues((current) => ({ ...current, [field]: value }));
  }

  function save(): void {
    setHasTried(true);
    if (Object.keys(problems).length > 0) return;
    void submit(values);
  }

  return (
    <>
      <ScrollView automaticallyAdjustKeyboardInsets contentContainerStyle={{ gap: spacing.lg, padding: spacing.lg }} contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled">
        {failure ? <Banner message={failure} /> : null}
        <FormField
          editable={!locked}
          error={errorFor("name")}
          label={MESSAGES.name}
          maxLength={VENDOR_NAME_MAX_LENGTH}
          onChangeText={(text) => edit("name", text)}
          required
          returnKeyType="next"
          value={values.name}
        />
        <PickerField disabled={locked} label={MESSAGES.category} onPress={() => setIsPickerOpen(true)} valueLabel={VENDOR_CATEGORY_LABELS[values.category]} />
        <FormField
          editable={!locked}
          keyboardType="phone-pad"
          label={MESSAGES.phone}
          maxLength={VENDOR_PHONE_MAX_LENGTH}
          onChangeText={(text) => edit("phone", text)}
          value={values.phone}
        />
        <FormField
          autoCapitalize="none"
          autoComplete="email"
          editable={!locked}
          error={errorFor("email")}
          keyboardType="email-address"
          label={MESSAGES.email}
          maxLength={VENDOR_EMAIL_MAX_LENGTH}
          onChangeText={(text) => edit("email", text)}
          value={values.email}
        />
        <FormField
          editable={!locked}
          label={MESSAGES.address}
          maxLength={VENDOR_ADDRESS_MAX_LENGTH}
          onChangeText={(text) => edit("address", text)}
          value={values.address}
        />
        <FormField
          editable={!locked}
          error={errorFor("hourly_rate")}
          keyboardType="decimal-pad"
          label={MESSAGES.hourlyRate}
          onChangeText={(text) => edit("hourly_rate", text)}
          placeholder={MESSAGES.hourlyRatePlaceholder}
          value={values.hourly_rate}
        />
        <FormField
          editable={!locked}
          inputStyle={{ minHeight: NOTES_MIN_HEIGHT, paddingTop: spacing.md, textAlignVertical: "top" }}
          label={MESSAGES.flatRates}
          multiline
          onChangeText={(text) => edit("flat_rate_notes", text)}
          placeholder={MESSAGES.flatRatesPlaceholder}
          value={values.flat_rate_notes}
        />
        <SwitchRow disabled={locked} label={MESSAGES.preferred} onValueChange={(next) => edit("preferred", next)} value={values.preferred} />
        <FormField
          editable={!locked}
          inputStyle={{ minHeight: NOTES_MIN_HEIGHT, paddingTop: spacing.md, textAlignVertical: "top" }}
          label={MESSAGES.notes}
          multiline
          onChangeText={(text) => edit("notes", text)}
          value={values.notes}
        />
        <LoadingButton disabled={locked} isLoading={isBusy} loadingText={original ? MESSAGES.saving : MESSAGES.adding} onPress={save}>
          {original ? MESSAGES.save : MESSAGES.add}
        </LoadingButton>
      </ScrollView>
      <OptionSheet<VendorCategory>
        isOpen={isPickerOpen}
        onClose={() => setIsPickerOpen(false)}
        onSelect={(category) => {
          setIsPickerOpen(false);
          edit("category", category);
        }}
        options={CATEGORY_OPTIONS}
        title={MESSAGES.chooseCategory}
        value={values.category}
      />
    </>
  );
}
