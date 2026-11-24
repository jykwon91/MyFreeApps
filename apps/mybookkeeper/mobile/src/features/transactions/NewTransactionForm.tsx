import { useGetPropertiesQuery } from "@mybookkeeper/api-client/store/propertiesApi";
import { DEFAULT_CATEGORY_FOR_TYPE } from "@mybookkeeper/api-client/constants/transactionTypes";
import { useCreateTransactionMutation } from "@mybookkeeper/api-client/store/transactionsApi";
import type { TransactionType } from "@mybookkeeper/api-client/types/transaction/TransactionType";
import { deviceDecimalSeparator, FIELD_PRESETS, FormField, goBackOr, KeyboardAwareScroll, LoadingButton, OptionSheet, PickerField, SegmentedControl, SwitchRow, useConfirmLeave, useFieldChain, useTheme, useToast } from "@platform/mobile";
import { useEffect, useState } from "react";
import { Alert, View } from "react-native";
import { CHANNEL_OPTIONS, PAYMENT_METHOD_CHOICES } from "../../constants/transactionCreateOptions";
import { PICKER_LOAD_MESSAGES } from "../../constants/pickerLoad";
import { NONE_OPTION_VALUE } from "../../constants/transactionEdit";
import { TRANSACTION_FIELD_LABELS as LABELS, TRANSACTION_SHEET_TITLES } from "../../constants/transactionFieldLabels";
import { TRANSACTION_TYPES } from "../../constants/transactionFilters";
import { pickerLoadError } from "../../lib/pickerLoadError";
import type { TransactionChoice } from "../../types/TransactionChoice";
import type { TransactionSheetConfig } from "../../types/TransactionSheetConfig";
import type { TransactionCreateValues } from "../../types/TransactionCreateValues";
import PeriodDateRow from "../shell/PeriodDateRow";
import { categoryLabel, propertyLabel } from "./transactionDisplay";
import { blankCreateValues, choiceLabel, createAmountError, createPayload, fromChoice } from "./transactionCreateValues";
import { categoryChoices, selectableProperties } from "./transactionEditValues";
import { createFailureMessage } from "./transactionMessages";
import { isCancelledRequest } from "@platform/core/utils/isCancelledRequest";

type SheetName = "category" | "property" | "channel" | "paymentMethod";

/** Adds a transaction by hand, with the same fields and the same request as the website's form. */
export default function NewTransactionForm() {
  const { spacing } = useTheme();
  const { showToast } = useToast();
  const { data: loadedProperties, error: propertiesError, refetch: refetchProperties } = useGetPropertiesQuery();
  const properties = loadedProperties ?? [];
  const [createTransaction, { isLoading: isSaving }] = useCreateTransactionMutation();
  const [decimalSeparator] = useState(deviceDecimalSeparator);
  const [initial] = useState(() => blankCreateValues(new Date()));
  const [values, setValues] = useState<TransactionCreateValues>(initial);
  const [showAmountError, setShowAmountError] = useState(false);
  const [openSheet, setOpenSheet] = useState<SheetName | null>(null);
  const [isDateOpen, setIsDateOpen] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const fields = useFieldChain(["amount", "vendor", "description"]);

  const locked = isSaving || isLeaving;
  const isDirty = JSON.stringify(values) !== JSON.stringify(initial);
  const amountProblem = showAmountError ? createAmountError(values, decimalSeparator) : undefined;

  useConfirmLeave(isDirty && !isLeaving, (leave) => {
    if (isSaving) return;
    Alert.alert("Discard this transaction?", "I haven't added it yet.", [
      { text: "Keep editing", style: "cancel" },
      { text: "Discard", style: "destructive", onPress: leave },
    ]);
  });

  // Leaving has to wait a render, or the discard prompt still sees the unsaved details.
  useEffect(() => {
    if (isLeaving) goBackOr("/money");
  }, [isLeaving]);

  function update(change: Partial<TransactionCreateValues>): void {
    setValues((current) => ({ ...current, ...change }));
  }

  async function save(): Promise<void> {
    if (createAmountError(values, decimalSeparator)) {
      setShowAmountError(true);
      return;
    }
    try {
      await createTransaction(createPayload(values, decimalSeparator)).unwrap();
      showToast("Added.");
      setIsLeaving(true);
    } catch (error) {
      if (isCancelledRequest(error)) return;
      showToast(createFailureMessage(error), "error");
    }
  }

  // Until the properties are here, "No property" would be the only row, and picking it would read as "you have none".
  const propertyChoices: TransactionChoice[] = loadedProperties
    ? [{ value: NONE_OPTION_VALUE, label: "No property" }, ...selectableProperties(properties, null).map((property) => ({ value: property.id, label: property.name }))]
    : [];
  const sheets: Record<SheetName, TransactionSheetConfig> = {
    category: {
      options: categoryChoices(values.type, values.category).map((category) => ({ value: category, label: categoryLabel(category) })),
      value: values.category,
      apply: (category) => update({ category }),
    },
    property: {
      options: propertyChoices,
      emptyText: PICKER_LOAD_MESSAGES.propertiesLoading,
      loadError: pickerLoadError({ hasLoaded: loadedProperties !== undefined, error: propertiesError, refetch: refetchProperties }, PICKER_LOAD_MESSAGES.propertiesFailed),
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
        <View pointerEvents={locked ? "none" : "auto"} style={{ gap: spacing.lg }}>
          <PeriodDateRow
            isOpen={isDateOpen}
            label="Date"
            onChange={(date) => update({ date })}
            onToggle={() => setIsDateOpen((open) => !open)}
            value={values.date}
          />
          <SegmentedControl
            accessibilityLabel="Type"
            onChange={(type: TransactionType) => update({ type, category: DEFAULT_CATEGORY_FOR_TYPE[type] })}
            segments={TRANSACTION_TYPES}
            value={values.type}
          />
          <FormField
            {...FIELD_PRESETS.decimal}
            {...fields.field("amount")}
            error={amountProblem}
            label="Amount (USD)"
            onChangeText={(amount) => update({ amount })}
            placeholder="0.00"
            required
            value={values.amount}
          />
          <FormField {...fields.field("vendor")} label="Vendor" onChangeText={(vendor) => update({ vendor })} placeholder="e.g. Home Depot" value={values.vendor} />
          <FormField {...fields.target("description")} label="Description" multiline onChangeText={(description) => update({ description })} placeholder="Optional details" value={values.description} />
          <PickerField label="Category" onPress={() => setOpenSheet("category")} valueLabel={categoryLabel(values.category)} />
          <PickerField label="Property" onPress={() => setOpenSheet("property")} valueLabel={propertyLabel(values.propertyId, properties)} />
          <PickerField label={LABELS.channel} onPress={() => setOpenSheet("channel")} valueLabel={choiceLabel(CHANNEL_OPTIONS, values.channel)} />
          <PickerField label={LABELS.paymentMethod} onPress={() => setOpenSheet("paymentMethod")} valueLabel={choiceLabel(PAYMENT_METHOD_CHOICES, values.paymentMethod)} />
          {values.type === "transfer" ? null : (
            <SwitchRow label={LABELS.taxRelevant} onValueChange={(taxRelevant) => update({ taxRelevant })} value={values.taxRelevant} />
          )}
        </View>
        <LoadingButton disabled={locked} isLoading={isSaving} loadingText="Adding…" onPress={save}>
          Add transaction
        </LoadingButton>
      </KeyboardAwareScroll>

      <OptionSheet
        emptyText={sheet?.emptyText}
        isOpen={sheet !== null}
        loadError={sheet?.loadError}
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
