import { ASSIGN_VENDOR_LIST_ARGS } from "@mybookkeeper/api-client/constants/assignVendorList";
import { useGetPropertiesQuery } from "@mybookkeeper/api-client/store/propertiesApi";
import { useUpdateTransactionMutation } from "@mybookkeeper/api-client/store/transactionsApi";
import { useGetVendorsQuery } from "@mybookkeeper/api-client/store/vendorsApi";
import type { Transaction } from "@mybookkeeper/api-client/types/transaction/transaction";
import type { TransactionType } from "@mybookkeeper/api-client/types/transaction/TransactionType";
import { Banner, FormField, KeyboardAwareScroll, LoadingButton, OptionSheet, SegmentedControl, SwitchRow, useConfirmLeave, useTheme, useToast } from "@platform/mobile";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, Text } from "react-native";
import { CHANNEL_OPTIONS, PAYMENT_METHOD_CHOICES } from "../../constants/transactionCreateOptions";
import { DEFAULT_CATEGORY, NONE_OPTION_VALUE, TRANSACTION_EDIT_SHEET, TRANSACTION_SAVE_ACTION } from "../../constants/transactionEdit";
import { SAVED_VENDOR_MESSAGES, TRANSACTION_FIELD_LABELS as LABELS, TRANSACTION_SHEET_TITLES } from "../../constants/transactionFieldLabels";
import { TRANSACTION_TYPES } from "../../constants/transactionFilters";
import type { TransactionEditSheet } from "../../types/TransactionEditSheet";
import type { TransactionEditValues } from "../../types/TransactionEditValues";
import type { TransactionSaveAction } from "../../types/TransactionSaveAction";
import type { TransactionSheetConfig } from "../../types/TransactionSheetConfig";
import PeriodDateRow from "../shell/PeriodDateRow";
import PickerField from "./PickerField";
import { confirmTaxYearChange } from "./confirmTaxYearChange";
import { savedVendorChoices, savedVendorLabel } from "./savedVendor";
import { otherTaxYear } from "./taxYear";
import { choiceLabel, fromChoice } from "./transactionCreateValues";
import { categoryLabel, isReviewable, propertyLabel } from "./transactionDisplay";
import { amountError, categoryChoices, categoryFitsType, changedFields, selectableProperties, taxYearError, toEditValues } from "./transactionEditValues";
import { othersUpdatedSentence, saveFailureMessage } from "./transactionMessages";

export default function TransactionEditForm({ original }: { original: Transaction }) {
  const { colors, spacing, fontSize } = useTheme();
  const { showToast } = useToast();
  const { data: properties = [] } = useGetPropertiesQuery();
  const { data: vendorList, isError: vendorsFailed, isLoading: vendorsLoading, refetch: refetchVendors } = useGetVendorsQuery(ASSIGN_VENDOR_LIST_ARGS);
  const vendors = vendorList?.items ?? [];
  const [updateTransaction, { isLoading: isSaving }] = useUpdateTransactionMutation();
  const [values, setValues] = useState<TransactionEditValues>(() => toEditValues(original));
  const [showProblems, setShowProblems] = useState(false);
  const [openSheet, setOpenSheet] = useState<TransactionEditSheet | null>(null);
  const [savingAction, setSavingAction] = useState<TransactionSaveAction | null>(null);
  const [categoryWasReset, setCategoryWasReset] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const [isDateOpen, setIsDateOpen] = useState(false);

  const changes = changedFields(values, original);
  const isDirty = Object.keys(changes).length > 0;
  const reviewable = isReviewable(original.status);
  const vendor = values.vendor.trim();
  const amountProblem = showProblems ? amountError(values, original) : undefined;
  const taxYearProblem = showProblems ? taxYearError(values, original) : undefined;

  useConfirmLeave(isDirty && !isLeaving, (leave) => {
    if (isSaving) return;
    Alert.alert("Discard your changes?", "I haven't saved them yet.", [
      { text: "Keep editing", style: "cancel" },
      { text: "Discard", style: "destructive", onPress: leave },
    ]);
  });

  // Leaving has to wait a render, or the discard prompt still sees the unsaved changes.
  useEffect(() => {
    if (isLeaving) router.back();
  }, [isLeaving]);

  function update(change: Partial<TransactionEditValues>): void {
    setValues((current) => ({ ...current, ...change }));
  }

  function openSavedVendorSheet(): void {
    // The sheet tells them to try again, so reopening it has to actually try again.
    if (vendorsFailed) refetchVendors();
    setOpenSheet(TRANSACTION_EDIT_SHEET.savedVendor);
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
    if (amountError(values, original) || taxYearError(values, original)) {
      setShowProblems(true);
      return;
    }
    const approval: Partial<Transaction> = approve ? { ...changes, status: "approved" } : changes;
    if (Object.keys(approval).length === 0) {
      setIsLeaving(true);
      return;
    }
    // A tax year typed in is already the answer, so only a new date alone asks which year it files under.
    const newTaxYear = changes.transaction_date && changes.tax_year === undefined ? otherTaxYear(changes.transaction_date, original) : null;
    const choice = newTaxYear === null ? "keep" : await confirmTaxYearChange(original.tax_year, newTaxYear);
    if (choice === "cancel") return;
    const data: Partial<Transaction> = choice === "move" && newTaxYear !== null ? { ...approval, tax_year: newTaxYear } : approval;
    setSavingAction(approve ? TRANSACTION_SAVE_ACTION.approve : TRANSACTION_SAVE_ACTION.save);
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

  const sheets: Record<TransactionEditSheet, TransactionSheetConfig> = {
    category: {
      options: categoryChoices(values.type, values.category).map((category) => ({ value: category, label: categoryLabel(category) })),
      value: values.category,
      apply: (category) => {
        setCategoryWasReset(false);
        update({ category });
      },
    },
    property: {
      options: [
        { value: NONE_OPTION_VALUE, label: "No property" },
        ...selectableProperties(properties, original.property_id).map((property) => ({ value: property.id, label: property.name })),
      ],
      value: values.propertyId ?? NONE_OPTION_VALUE,
      apply: (propertyId) => update({ propertyId: fromChoice(propertyId) || null }),
    },
    savedVendor: {
      options: savedVendorChoices(vendors, !(vendorsFailed && values.vendorId !== null)),
      value: values.vendorId ?? NONE_OPTION_VALUE,
      apply: (vendorId) => update({ vendorId: fromChoice(vendorId) || null }),
      description: vendorsFailed ? SAVED_VENDOR_MESSAGES.loadFailed : SAVED_VENDOR_MESSAGES.sheetDescription,
    },
    channel: {
      options: CHANNEL_OPTIONS,
      value: values.channel || NONE_OPTION_VALUE,
      apply: (channel) => update({ channel: fromChoice(channel) }),
    },
    paymentMethod: {
      options: PAYMENT_METHOD_CHOICES,
      value: values.paymentMethod || NONE_OPTION_VALUE,
      apply: (paymentMethod) => update({ paymentMethod: fromChoice(paymentMethod) }),
    },
  };
  const sheet = openSheet ? sheets[openSheet] : null;
  const categoryHint = categoryWasReset
    ? `I changed the category to ${categoryLabel(values.category)}. Change it if that's wrong.`
    : changes.category && vendor
      ? `I'll remember this for ${vendor} and fix other ${vendor} transactions that had the old category.`
      : undefined;
  const propertyHint =
    changes.property_id && vendor && original.address ? `I'll move other ${vendor} transactions at this address too.` : undefined;

  return (
    <>
      <KeyboardAwareScroll
        contentContainerStyle={{ gap: spacing.lg, padding: spacing.lg }}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
      >
        {original.status === "approved" ? <Banner message="This one is approved, so changes show up in your totals right away." /> : null}
        <PeriodDateRow isOpen={isDateOpen} label="Date" onChange={(date) => update({ date })} onToggle={() => setIsDateOpen((open) => !open)} value={values.date} />
        <FormField
          error={taxYearProblem}
          keyboardType="number-pad"
          label={LABELS.taxYear}
          maxLength={4}
          onChangeText={(taxYear) => update({ taxYear })}
          value={values.taxYear}
        />
        <FormField label="Vendor" onChangeText={(vendorText) => update({ vendor: vendorText })} value={values.vendor} />
        <PickerField
          disabled={vendorsLoading}
          label={LABELS.savedVendor}
          onPress={openSavedVendorSheet}
          value={vendorsLoading ? SAVED_VENDOR_MESSAGES.loading : savedVendorLabel(values.vendorId, vendors)}
        />
        <FormField
          error={amountProblem}
          keyboardType="decimal-pad"
          label="Amount (USD)"
          onChangeText={(amount) => update({ amount })}
          value={values.amount}
        />
        <SegmentedControl accessibilityLabel="Type" onChange={changeType} segments={TRANSACTION_TYPES} value={values.type} />
        <PickerField hint={categoryHint} label="Category" onPress={() => setOpenSheet(TRANSACTION_EDIT_SHEET.category)} value={categoryLabel(values.category)} />
        <PickerField hint={propertyHint} label="Property" onPress={() => setOpenSheet(TRANSACTION_EDIT_SHEET.property)} value={propertyLabel(values.propertyId, properties)} />
        <FormField
          label="Description"
          multiline
          onChangeText={(description) => update({ description })}
          value={values.description}
        />
        <PickerField label={LABELS.channel} onPress={() => setOpenSheet(TRANSACTION_EDIT_SHEET.channel)} value={choiceLabel(CHANNEL_OPTIONS, values.channel)} />
        <PickerField
          label={LABELS.paymentMethod}
          onPress={() => setOpenSheet(TRANSACTION_EDIT_SHEET.paymentMethod)}
          value={choiceLabel(PAYMENT_METHOD_CHOICES, values.paymentMethod)}
        />
        <SwitchRow label={LABELS.taxRelevant} onValueChange={(taxRelevant) => update({ taxRelevant })} value={values.taxRelevant} />

        {reviewable ? (
          <>
            {values.propertyId ? null : <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>Choose a property to approve.</Text>}
            <LoadingButton
              disabled={!values.propertyId || isSaving}
              isLoading={savingAction === TRANSACTION_SAVE_ACTION.approve}
              loadingText="Saving…"
              onPress={() => save(true)}
            >
              Save and approve
            </LoadingButton>
            <LoadingButton
              disabled={isSaving}
              isLoading={savingAction === TRANSACTION_SAVE_ACTION.save}
              loadingText="Saving…"
              onPress={() => save(false)}
              variant="ghost"
            >
              Save without approving
            </LoadingButton>
          </>
        ) : (
          <LoadingButton disabled={isSaving} isLoading={savingAction === TRANSACTION_SAVE_ACTION.save} loadingText="Saving…" onPress={() => save(false)}>
            Save
          </LoadingButton>
        )}
      </KeyboardAwareScroll>

      <OptionSheet
        description={sheet?.description}
        isOpen={sheet !== null}
        onClose={() => setOpenSheet(null)}
        onSelect={(value) => {
          sheet?.apply(value);
          setOpenSheet(null);
        }}
        options={sheet?.options ?? []}
        title={openSheet ? TRANSACTION_SHEET_TITLES[openSheet] : ""}
        value={sheet?.value ?? null}
      />
    </>
  );
}
