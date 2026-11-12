import { CLASSIFICATION_CHOICES } from "@mybookkeeper/api-client/constants/propertyClassificationChoices";
import { PROPERTY_STATE_LENGTH } from "@mybookkeeper/api-client/constants/propertyForm";
import type { Property } from "@mybookkeeper/api-client/types/property/property";
import type { PropertyClassification } from "@mybookkeeper/api-client/types/property/PropertyClassification";
import type { PropertyForm } from "@mybookkeeper/api-client/types/property/PropertyForm";
import type { PropertyType } from "@mybookkeeper/api-client/types/property/PropertyType";
import { blankForm, fromProperty, isBlank, propertyChanges, propertyFormProblems, withClassification } from "@mybookkeeper/api-client/utils/propertyForm";
import { Banner, FormField, LoadingButton, OptionSheet, PickerField, SegmentedControl, useDiscardPrompt, useTheme } from "@platform/mobile";
import { useState } from "react";
import { ScrollView, View } from "react-native";
import { PROPERTY_FORM_MESSAGES as MESSAGES, PROPERTY_TYPE_SEGMENTS } from "../../constants/propertyForm";
import { useSaveProperty } from "./useSaveProperty";

const CLASSIFICATION_OPTIONS = CLASSIFICATION_CHOICES.map(({ value, label }) => ({ value, label }));

/** Adds a property, or changes `original`. What's typed is kept here, so a reload can't overwrite it. */
export default function PropertyFormScreen({ original }: { original: Property | null }) {
  const { spacing } = useTheme();
  const [form, setForm] = useState<PropertyForm>(() => (original ? fromProperty(original) : blankForm()));
  const [hasTried, setHasTried] = useState(false);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const { submit, isBusy, isLeaving, failure } = useSaveProperty(original);

  const problems = propertyFormProblems(form, original);
  const isDirty = original ? Object.keys(propertyChanges(form, original)).length > 0 : !isBlank(form);
  const choice = CLASSIFICATION_CHOICES.find((candidate) => candidate.value === form.classification);
  const locked = isBusy || isLeaving;
  const errorFor = (field: keyof PropertyForm) => (hasTried ? problems[field] : undefined);

  useDiscardPrompt(isDirty && !isLeaving, isBusy);

  function edit(field: keyof PropertyForm, text: string): void {
    setForm((current) => ({ ...current, [field]: text }));
  }

  function save(): void {
    setHasTried(true);
    if (Object.keys(problems).length > 0) return;
    void submit(form);
  }

  return (
    <>
      <ScrollView automaticallyAdjustKeyboardInsets contentContainerStyle={{ gap: spacing.lg, padding: spacing.lg }} contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled">
        {failure ? <Banner message={failure} /> : null}
        <FormField
          editable={!locked}
          error={errorFor("name")}
          label={MESSAGES.name}
          onChangeText={(text) => edit("name", text)}
          placeholder={MESSAGES.namePlaceholder}
          required
          returnKeyType="next"
          value={form.name}
        />
        <FormField
          autoComplete="street-address"
          editable={!locked}
          error={errorFor("street")}
          label={MESSAGES.street}
          onChangeText={(text) => edit("street", text)}
          placeholder={MESSAGES.streetPlaceholder}
          required
          returnKeyType="next"
          value={form.street}
        />
        <FormField
          editable={!locked}
          error={errorFor("city")}
          label={MESSAGES.city}
          onChangeText={(text) => edit("city", text)}
          required
          returnKeyType="next"
          value={form.city}
        />
        <View style={{ flexDirection: "row", gap: spacing.md }}>
          <FormField
            autoCapitalize="characters"
            editable={!locked}
            error={errorFor("state")}
            label={MESSAGES.state}
            maxLength={PROPERTY_STATE_LENGTH}
            onChangeText={(text) => edit("state", text)}
            placeholder={MESSAGES.statePlaceholder}
            required
            returnKeyType="next"
            style={{ flex: 1 }}
            value={form.state}
          />
          <FormField
            autoComplete="postal-code"
            editable={!locked}
            error={errorFor("zip")}
            keyboardType="numbers-and-punctuation"
            label={MESSAGES.zip}
            onChangeText={(text) => edit("zip", text)}
            required
            style={{ flex: 2 }}
            value={form.zip}
          />
        </View>
        <PickerField
          disabled={locked}
          hint={choice?.description ?? MESSAGES.classificationWhy}
          label={MESSAGES.classification}
          onPress={() => setIsPickerOpen(true)}
          valueLabel={choice?.label ?? ""}
        />
        {form.classification === "investment" ? (
          <SegmentedControl<PropertyType>
            accessibilityLabel={MESSAGES.rentalTypeLabel}
            onChange={(type) => setForm((current) => ({ ...current, type }))}
            segments={PROPERTY_TYPE_SEGMENTS}
            value={form.type ?? "short_term"}
          />
        ) : null}
        <LoadingButton
          disabled={locked}
          isLoading={isBusy}
          loadingText={original ? MESSAGES.saving : MESSAGES.adding}
          onPress={save}
        >
          {original ? MESSAGES.save : MESSAGES.add}
        </LoadingButton>
      </ScrollView>
      <OptionSheet<PropertyClassification>
        description={MESSAGES.classificationWhy}
        isOpen={isPickerOpen}
        onClose={() => setIsPickerOpen(false)}
        onSelect={(classification) => {
          setIsPickerOpen(false);
          setForm((current) => withClassification(current, classification));
        }}
        options={CLASSIFICATION_OPTIONS}
        title={MESSAGES.chooseClassification}
        value={form.classification}
      />
    </>
  );
}
