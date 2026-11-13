import { useGetPropertiesQuery } from "@mybookkeeper/api-client/store/propertiesApi";
import { useCreateTransactionMutation } from "@mybookkeeper/api-client/store/transactionsApi";
import type { TransactionType } from "@mybookkeeper/api-client/types/transaction/TransactionType";
import { FormField, KeyboardAwareScroll, LoadingButton, OptionSheet, SegmentedControl, SwitchRow, useConfirmLeave, useTheme, useToast } from "@platform/mobile";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, View } from "react-native";
import { CHANNEL_OPTIONS, PAYMENT_METHOD_CHOICES } from "../../constants/transactionCreateOptions";
import { DEFAULT_CATEGORY, NONE_OPTION_VALUE } from "../../constants/transactionEdit";
import { TRANSACTION_FIELD_LABELS as LABELS, TRANSACTION_SHEET_TITLES } from "../../constants/transactionFieldLabels";
import { TRANSACTION_TYPES } from "../../constants/transactionFilters";
import type { TransactionChoice } from "../../types/TransactionChoice";
import type { TransactionSheetConfig } from "../../types/TransactionSheetConfig";
import type { TransactionCreateValues } from "../../types/TransactionCreateValues";
import PeriodDateRow from "../shell/PeriodDateRow";
import PickerField from "./PickerField";
import { categoryLabel, propertyLabel } from "./transactionDisplay";
import { blankCreateValues, choiceLabel, createAmountError, createPayload, fromChoice } from "./transactionCreateValues";
import { categoryChoices, selectableProperties } from "./transactionEditValues";
import { createFailureMessage } from "./transactionMessages";

type SheetName = "category" | "property" | "channel" | "paymentMethod";

/** Adds a transaction by hand, with the same fields and the same request as the website's form. */
export default function NewTransactionForm() {
  const { spacing } = useTheme();
  const { showToast } = useToast();
  const { data: properties = [] } = useGetPropertiesQuery();
  const [createTransaction, { isLoading: isSaving }] = useCreateTransactionMutation();
  const [initial] = useState(() => blankCreateValues(new Date()));
  const [values, setValues] = useState<TransactionCreateValues>(initial);
  const [showAmountError, setShowAmountError] = useState(false);
  const [openSheet, setOpenSheet] = useState<SheetName | null>(null);
  const [isDateOpen, setIsDateOpen] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);

  const isDirty = JSON.stringify(values) !== JSON.stringify(initial);
  const amountProblem = showAmountError ? createAmountError(values) : undefined;

  useConfirmLeave(isDirty && !isLeaving, (leave) => {
    if (isSaving) return;
    Alert.alert("Discard this transaction?", "I haven't added it yet.", [
      { text: "Keep editing", style: "cancel" },
      { text: "Discard", style: "destructive", onPress: leave },
    ]);
  });

  // Leaving has to wait a render, or the discard prompt still sees the unsaved details.
  useEffect(() => {
    if (isLeaving) router.back();
  }, [isLeaving]);

  function update(change: Partial<TransactionCreateValues>): void {
    setValues((current) => ({ ...current, ...change }));
  }

  async function save(): Promise<void> {
    if (createAmountError(values)) {
      setShowAmountError(true);
      return;
    }
    try {
      await createTransaction(createPayload(values)).unwrap();
      showToast("Added.");
      setIsLeaving(true);
    } catch (error) {
      showToast(createFailureMessage(error), "error");
    }
  }

  const propertyChoices: TransactionChoice[] = [
    { value: NONE_OPTION_VALUE, label: "No property" },
    ...selectableProperties(properties, null).map((property) => ({ value: property.id, label: property.name })),
  ];
  const sheets: Record<SheetName, TransactionSheetConfig> = {
    category: {
      options: categoryChoices(values.type, values.category).map((category) => ({ value: category, label: categoryLabel(category) })),
      value: values.category,
      apply: (category) => update({ category }),
    },
    property: {
      options: propertyChoices,
      value: values.propertyId ?? NONE_OPTION_VALUE,
      apply: (propertyId) => update({ propertyId: fromChoice(propertyId) || null }),
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

  return (
    <>
      <KeyboardAwareScroll
        contentContainerStyle={{ gap: spacing.lg, padding: spacing.lg }}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
      >
        <View pointerEvents={isSaving ? "none" : "auto"} style={{ gap: spacing.lg }}>
          <PeriodDateRow
            isOpen={isDateOpen}
            label="Date"
            onChange={(date) => update({ date })}
            onToggle={() => setIsDateOpen((open) => !open)}
            value={values.date}
          />
          <SegmentedControl
            accessibilityLabel="Type"
            onChange={(type: TransactionType) => update({ type, category: DEFAULT_CATEGORY[type] })}
            segments={TRANSACTION_TYPES}
            value={values.type}
          />
          <FormField
            error={amountProblem}
            keyboardType="decimal-pad"
            label="Amount (USD)"
            onChangeText={(amount) => update({ amount })}
            placeholder="0.00"
            required
            value={values.amount}
          />
          <FormField label="Vendor" onChangeText={(vendor) => update({ vendor })} placeholder="e.g. Home Depot" value={values.vendor} />
          <FormField label="Description" multiline onChangeText={(description) => update({ description })} placeholder="Optional details" value={values.description} />
          <PickerField label="Category" onPress={() => setOpenSheet("category")} value={categoryLabel(values.category)} />
          <PickerField label="Property" onPress={() => setOpenSheet("property")} value={propertyLabel(values.propertyId, properties)} />
          <PickerField label={LABELS.channel} onPress={() => setOpenSheet("channel")} value={choiceLabel(CHANNEL_OPTIONS, values.channel)} />
          <PickerField label={LABELS.paymentMethod} onPress={() => setOpenSheet("paymentMethod")} value={choiceLabel(PAYMENT_METHOD_CHOICES, values.paymentMethod)} />
          <SwitchRow label={LABELS.taxRelevant} onValueChange={(taxRelevant) => update({ taxRelevant })} value={values.taxRelevant} />
        </View>
        <LoadingButton isLoading={isSaving} loadingText="Adding…" onPress={save}>
          Add transaction
        </LoadingButton>
      </KeyboardAwareScroll>

      <OptionSheet
        isOpen={sheet !== null}
        onClose={() => setOpenSheet(null)}
        onSelect={(value) => {
          sheet?.apply(value);
          setOpenSheet(null);
        }}
        options={sheet?.options ?? []}
        title={openSheet ? TRANSACTION_SHEET_TITLES[openSheet] : ""}
        value={sheet?.value ?? ""}
      />
    </>
  );
}
