import { useGetPropertiesQuery } from "@mybookkeeper/api-client/store/propertiesApi";
import { useUpdateTransactionMutation } from "@mybookkeeper/api-client/store/transactionsApi";
import type { Transaction } from "@mybookkeeper/api-client/types/transaction/transaction";
import type { TransactionType } from "@mybookkeeper/api-client/types/transaction/TransactionType";
import { Banner, FormField, LoadingButton, OptionSheet, SegmentedControl, useTheme, useToast } from "@platform/mobile";
import { router, useNavigation, usePreventRemove } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, ScrollView, Text } from "react-native";
import { DEFAULT_CATEGORY, NO_PROPERTY_OPTION } from "../../constants/transactionEdit";
import { TRANSACTION_TYPES } from "../../constants/transactionFilters";
import type { TransactionEditValues } from "../../types/TransactionEditValues";
import PickerField from "./PickerField";
import { categoryLabel, isReviewable, propertyLabel } from "./transactionDisplay";
import { amountError, categoryChoices, categoryFitsType, changedFields, selectableProperties, toEditValues } from "./transactionEditValues";
import { othersUpdatedSentence, saveFailureMessage } from "./transactionMessages";

export default function TransactionEditForm({ original }: { original: Transaction }) {
  const { colors, spacing, fontSize } = useTheme();
  const { showToast } = useToast();
  const navigation = useNavigation();
  const { data: properties = [] } = useGetPropertiesQuery();
  const [updateTransaction, { isLoading: isSaving }] = useUpdateTransactionMutation();
  const [values, setValues] = useState<TransactionEditValues>(() => toEditValues(original));
  const [showAmountError, setShowAmountError] = useState(false);
  const [openSheet, setOpenSheet] = useState<"category" | "property" | null>(null);
  const [savingAction, setSavingAction] = useState<"approve" | "save" | null>(null);
  const [categoryWasReset, setCategoryWasReset] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);

  const changes = changedFields(values, original);
  const isDirty = Object.keys(changes).length > 0;
  const reviewable = isReviewable(original.status);
  const vendor = values.vendor.trim();
  const amountProblem = showAmountError ? amountError(values, original) : undefined;

  usePreventRemove(isDirty && !isLeaving, ({ data }) => {
    Alert.alert("Discard your changes?", "I haven't saved them yet.", [
      { text: "Keep editing", style: "cancel" },
      { text: "Discard", style: "destructive", onPress: () => navigation.dispatch(data.action) },
    ]);
  });

  // Leaving has to wait a render, or the discard prompt still sees the unsaved changes.
  useEffect(() => {
    if (isLeaving) router.back();
  }, [isLeaving]);

  function update(change: Partial<TransactionEditValues>): void {
    setValues((current) => ({ ...current, ...change }));
  }

  function changeType(type: TransactionType): void {
    // Going back to the row's own type restores its category: otherwise two taps
    // would save a category nobody chose, and that teaches a vendor rule.
    const category = type === original.transaction_type ? original.category : values.category;
    const fits = type === original.transaction_type || categoryFitsType(type, category);
    setCategoryWasReset(!fits);
    update({ type, category: fits ? category : DEFAULT_CATEGORY[type] });
  }

  async function save(approve: boolean): Promise<void> {
    if (amountError(values, original)) {
      setShowAmountError(true);
      return;
    }
    const data: Partial<Transaction> = approve ? { ...changes, status: "approved" } : changes;
    if (Object.keys(data).length === 0) {
      setIsLeaving(true);
      return;
    }
    setSavingAction(approve ? "approve" : "save");
    try {
      const result = await updateTransaction({ id: original.id, data }).unwrap();
      const learned = changes.category && vendor ? ` I'll file ${vendor} under ${categoryLabel(values.category)} from now on.` : "";
      showToast(`Saved.${learned}${othersUpdatedSentence(result, vendor || null)}`);
      setIsLeaving(true);
    } catch (error) {
      showToast(saveFailureMessage(error), "error");
    } finally {
      setSavingAction(null);
    }
  }

  const propertyOptions = [
    { value: NO_PROPERTY_OPTION, label: "No property" },
    ...selectableProperties(properties, original.property_id).map((property) => ({ value: property.id, label: property.name })),
  ];
  const categoryOptions = categoryChoices(values.type, values.category).map((category) => ({
    value: category,
    label: categoryLabel(category),
  }));
  const categoryHint = categoryWasReset
    ? `I changed the category to ${categoryLabel(values.category)}. Change it if that's wrong.`
    : changes.category && vendor
      ? `I'll remember this for ${vendor} and fix other ${vendor} transactions that had the old category.`
      : undefined;
  const propertyHint =
    changes.property_id && vendor && original.address ? `I'll move other ${vendor} transactions at this address too.` : undefined;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={100} style={{ flex: 1 }}>
      <ScrollView
        contentContainerStyle={{ gap: spacing.lg, padding: spacing.lg }}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
      >
        {original.status === "approved" ? <Banner message="This one is approved, so changes show up in your totals right away." /> : null}
        <FormField label="Vendor" onChangeText={(vendorText) => update({ vendor: vendorText })} value={values.vendor} />
        <FormField
          error={amountProblem}
          keyboardType="decimal-pad"
          label="Amount (USD)"
          onChangeText={(amount) => update({ amount })}
          value={values.amount}
        />
        <SegmentedControl accessibilityLabel="Type" onChange={changeType} segments={TRANSACTION_TYPES} value={values.type} />
        <PickerField hint={categoryHint} label="Category" onPress={() => setOpenSheet("category")} value={categoryLabel(values.category)} />
        <PickerField hint={propertyHint} label="Property" onPress={() => setOpenSheet("property")} value={propertyLabel(values.propertyId, properties)} />
        <FormField
          label="Description"
          multiline
          onChangeText={(description) => update({ description })}
          value={values.description}
        />

        {reviewable ? (
          <>
            {values.propertyId ? null : <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>Choose a property to approve.</Text>}
            <LoadingButton
              disabled={!values.propertyId || isSaving}
              isLoading={savingAction === "approve"}
              loadingText="Saving…"
              onPress={() => save(true)}
            >
              Save and approve
            </LoadingButton>
            <LoadingButton
              disabled={isSaving}
              isLoading={savingAction === "save"}
              loadingText="Saving…"
              onPress={() => save(false)}
              variant="ghost"
            >
              Save without approving
            </LoadingButton>
          </>
        ) : (
          <LoadingButton disabled={isSaving} isLoading={savingAction === "save"} loadingText="Saving…" onPress={() => save(false)}>
            Save
          </LoadingButton>
        )}
      </ScrollView>

      <OptionSheet
        isOpen={openSheet === "category"}
        onClose={() => setOpenSheet(null)}
        onSelect={(category) => {
          setOpenSheet(null);
          setCategoryWasReset(false);
          update({ category });
        }}
        options={categoryOptions}
        title="Category"
        value={values.category}
      />
      <OptionSheet
        isOpen={openSheet === "property"}
        onClose={() => setOpenSheet(null)}
        onSelect={(propertyId) => {
          setOpenSheet(null);
          update({ propertyId: propertyId === NO_PROPERTY_OPTION ? null : propertyId });
        }}
        options={propertyOptions}
        title="Property"
        value={values.propertyId ?? NO_PROPERTY_OPTION}
      />
    </KeyboardAvoidingView>
  );
}
