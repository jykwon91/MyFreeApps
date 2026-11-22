import { CLASSIFICATION_CHOICES } from "@mybookkeeper/api-client/constants/propertyClassificationChoices";
import { PROPERTY_STATE_LENGTH } from "@mybookkeeper/api-client/constants/propertyForm";
import type { Property } from "@mybookkeeper/api-client/types/property/property";
import type { PropertyClassification } from "@mybookkeeper/api-client/types/property/PropertyClassification";
import type { PropertyForm } from "@mybookkeeper/api-client/types/property/PropertyForm";
import type { PropertyType } from "@mybookkeeper/api-client/types/property/PropertyType";
import { blankForm, fromProperty, isBlank, propertyChanges, propertyFormProblems, withClassification } from "@mybookkeeper/api-client/utils/propertyForm";
import { cleanPurchasePrice } from "@mybookkeeper/api-client/utils/purchasePrice";
import { RENTED_SINCE_MESSAGES } from "@mybookkeeper/api-client/constants/rentedSince";
import { depreciationInputChanges, landValueProblem, placedInServiceProblem, showsDepreciationInputs } from "@mybookkeeper/api-client/utils/depreciationInputs";
import { Banner, deviceDecimalSeparator, FIELD_PRESETS, FormField, KeyboardAwareScroll, LoadingButton, OptionSheet, PickerField, SegmentedControl, useDiscardPrompt, useFieldChain, useTheme } from "@platform/mobile";
import { useState } from "react";
import { Text, View } from "react-native";
import { PROPERTY_FORM_MESSAGES as MESSAGES, PROPERTY_TYPE_SEGMENTS } from "../../constants/propertyForm";
import { useTodayIso } from "../../lib/useTodayIso";
import OptionalDateField from "../shell/OptionalDateField";
import DepreciationFields from "./DepreciationFields";
import { useSaveProperty } from "./useSaveProperty";

const CLASSIFICATION_OPTIONS = CLASSIFICATION_CHOICES.map(({ value, label }) => ({ value, label }));

/** Adds a property, or changes `original`. What's typed is kept here, so a reload can't overwrite it. */
export default function PropertyFormScreen({ original }: { original: Property | null }) {
  const { colors, fontSize, spacing } = useTheme();
  const [form, setForm] = useState<PropertyForm>(() => (original ? fromProperty(original) : blankForm()));
  const [hasTried, setHasTried] = useState(false);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [purchasePrice, setPurchasePrice] = useState(original?.purchase_price ?? "");
  const [rentedSince, setRentedSince] = useState<string | null>(original?.rented_since ?? null);
  const [landValue, setLandValue] = useState(original?.land_value ?? "");
  const [placedInService, setPlacedInService] = useState<string | null>(original?.date_placed_in_service ?? null);
  const [decimalSeparator] = useState(deviceDecimalSeparator);
  const todayIso = useTodayIso();
  const { submit, isBusy, isLeaving, failure } = useSaveProperty(original);

  const problems = propertyFormProblems(form, original);
  const cleanedPrice = cleanPurchasePrice(purchasePrice);
  const priceBlank = purchasePrice.trim() === "";
  const priceRemoved = priceBlank && original?.purchase_price != null;
  const priceInvalid = priceRemoved || (!priceBlank && cleanedPrice === null);
  const rentedSinceRemoved = rentedSince === null && original?.rented_since != null;
  // Edit only, like rented-since: a new property has no purchase price to measure land against yet.
  const asksDepreciation = original !== null && showsDepreciationInputs(form.classification);
  const fields = useFieldChain(["name", "street", "city", "state", "zip", "purchasePrice", asksDepreciation && "landValue"]);
  const landValueError = asksDepreciation
    ? landValueProblem(landValue, cleanedPrice ?? original.purchase_price ?? null, original.land_value, decimalSeparator)
    : undefined;
  const placedInServiceError = asksDepreciation
    ? placedInServiceProblem(placedInService, original.date_placed_in_service, todayIso)
    : undefined;
  const isDirty = original
    ? Object.keys(propertyChanges(form, original)).length > 0
      || purchasePrice !== (original.purchase_price ?? "")
      || rentedSince !== (original.rented_since ?? null)
      || landValue !== (original.land_value ?? "")
      || placedInService !== (original.date_placed_in_service ?? null)
    : !isBlank(form) || !priceBlank;
  const choice = CLASSIFICATION_CHOICES.find((candidate) => candidate.value === form.classification);
  const locked = isBusy || isLeaving;
  const errorFor = (field: keyof PropertyForm) => (hasTried ? problems[field] : undefined);

  useDiscardPrompt(isDirty && !isLeaving, isBusy);

  function edit(field: keyof PropertyForm, text: string): void {
    setForm((current) => ({ ...current, [field]: text }));
  }

  function save(): void {
    setHasTried(true);
    if (Object.keys(problems).length > 0 || priceInvalid || rentedSinceRemoved || landValueError || placedInServiceError) return;
    const extra = {
      ...(cleanedPrice ? { purchase_price: cleanedPrice } : {}),
      ...(rentedSince && rentedSince !== original?.rented_since ? { rented_since: rentedSince } : {}),
      ...(asksDepreciation ? depreciationInputChanges(landValue, placedInService, original, decimalSeparator) : {}),
    };
    void submit(form, extra);
  }

  return (
    <>
      <KeyboardAwareScroll contentContainerStyle={{ gap: spacing.lg, padding: spacing.lg }} contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled">
        {failure ? <Banner message={failure} /> : null}
        <FormField
          {...fields.field("name")}
          editable={!locked}
          error={errorFor("name")}
          label={MESSAGES.name}
          onChangeText={(text) => edit("name", text)}
          placeholder={MESSAGES.namePlaceholder}
          required
          value={form.name}
        />
        <FormField
          {...FIELD_PRESETS.otherAddress}
          {...fields.field("street")}
          editable={!locked}
          error={errorFor("street")}
          label={MESSAGES.street}
          onChangeText={(text) => edit("street", text)}
          placeholder={MESSAGES.streetPlaceholder}
          required
          value={form.street}
        />
        <FormField
          {...FIELD_PRESETS.otherAddress}
          {...fields.field("city")}
          editable={!locked}
          error={errorFor("city")}
          label={MESSAGES.city}
          onChangeText={(text) => edit("city", text)}
          required
          value={form.city}
        />
        <View style={{ flexDirection: "row", gap: spacing.md }}>
          <FormField
            {...FIELD_PRESETS.otherAddress}
            {...fields.field("state")}
            autoCapitalize="characters"
            editable={!locked}
            error={errorFor("state")}
            label={MESSAGES.state}
            maxLength={PROPERTY_STATE_LENGTH}
            onChangeText={(text) => edit("state", text)}
            placeholder={MESSAGES.statePlaceholder}
            required
            style={{ flex: 1 }}
            value={form.state}
          />
          <FormField
            {...FIELD_PRESETS.otherAddress}
            {...fields.field("zip")}
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
        <FormField
          {...FIELD_PRESETS.decimal}
          {...fields.field("purchasePrice")}
          editable={!locked}
          error={hasTried && priceInvalid
            ? (priceRemoved ? MESSAGES.purchasePriceRemoved : MESSAGES.purchasePriceInvalid)
            : undefined}
          label={MESSAGES.purchasePrice}
          onChangeText={setPurchasePrice}
          placeholder={MESSAGES.purchasePricePlaceholder}
          value={purchasePrice}
        />
        {original?.purchase_price && (
          <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground, marginTop: -spacing.sm }}>
            {MESSAGES.purchasePriceHint}
          </Text>
        )}
        {asksDepreciation ? (
          <DepreciationFields
            chain={fields.field("landValue")}
            disabled={locked}
            landValue={landValue}
            landValueError={hasTried ? landValueError : undefined}
            onLandValueChange={setLandValue}
            onPlacedInServiceChange={setPlacedInService}
            placedInService={placedInService}
            placedInServiceError={hasTried ? placedInServiceError : undefined}
          />
        ) : null}
        {original ? (
          <>
            <OptionalDateField
              disabled={locked}
              error={hasTried && rentedSinceRemoved ? RENTED_SINCE_MESSAGES.removed : undefined}
              label={RENTED_SINCE_MESSAGES.label}
              maximumDate={new Date()}
              onChange={setRentedSince}
              startsAt={new Date()}
              value={rentedSince}
            />
            <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground, marginTop: -spacing.sm }}>
              {RENTED_SINCE_MESSAGES.hint}
            </Text>
          </>
        ) : null}
        <LoadingButton
          disabled={locked}
          isLoading={isBusy}
          loadingText={original ? MESSAGES.saving : MESSAGES.adding}
          onPress={save}
        >
          {original ? MESSAGES.save : MESSAGES.add}
        </LoadingButton>
      </KeyboardAwareScroll>
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
