import { useGetPropertiesQuery } from "@mybookkeeper/api-client/store/propertiesApi";
import { useCreateTransactionMutation } from "@mybookkeeper/api-client/store/transactionsApi";
import type { TransactionType } from "@mybookkeeper/api-client/types/transaction/TransactionType";
import { FormField, LoadingButton, MIN_TOUCH_TARGET, OptionSheet, SegmentedControl, useTheme, useToast } from "@platform/mobile";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, ScrollView, Switch, Text, View } from "react-native";
import { CHANNEL_OPTIONS, PAYMENT_METHOD_CHOICES } from "../../constants/transactionCreateOptions";
import { DEFAULT_CATEGORY, NO_PROPERTY_OPTION } from "../../constants/transactionEdit";
import { TRANSACTION_TYPES } from "../../constants/transactionFilters";
import { useConfirmLeave } from "../../lib/useConfirmLeave";
import type { TransactionChoice } from "../../types/TransactionChoice";
import type { TransactionCreateValues } from "../../types/TransactionCreateValues";
import PeriodDateRow from "../shell/PeriodDateRow";
import PickerField from "./PickerField";
import { categoryLabel, propertyLabel } from "./transactionDisplay";
import { blankCreateValues, choiceLabel, createAmountError, createPayload } from "./transactionCreateValues";
import { categoryChoices, selectableProperties } from "./transactionEditValues";
import { createFailureMessage } from "./transactionMessages";

type SheetName = "category" | "property" | "channel" | "paymentMethod";

const SHEET_TITLES: Record<SheetName, string> = {
  category: "Category",
  property: "Property",
  channel: "Channel",
  paymentMethod: "Payment method",
};

/** Adds a transaction by hand, with the same fields and the same request as the website's form. */
export default function NewTransactionScreen() {
  const { colors, spacing, fontSize } = useTheme();
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
    { value: NO_PROPERTY_OPTION, label: "No property" },
    ...selectableProperties(properties, null).map((property) => ({ value: property.id, label: property.name })),
  ];
  const sheets: Record<SheetName, { options: TransactionChoice[]; value: string; apply: (value: string) => void }> = {
    category: {
      options: categoryChoices(values.type, values.category).map((category) => ({ value: category, label: categoryLabel(category) })),
      value: values.category,
      apply: (category) => update({ category }),
    },
    property: {
      options: propertyChoices,
      value: values.propertyId ?? NO_PROPERTY_OPTION,
      apply: (propertyId) => update({ propertyId: propertyId === NO_PROPERTY_OPTION ? null : propertyId }),
    },
    channel: {
      options: CHANNEL_OPTIONS,
      value: values.channel || NO_PROPERTY_OPTION,
      apply: (channel) => update({ channel: channel === NO_PROPERTY_OPTION ? "" : channel }),
    },
    paymentMethod: {
      options: PAYMENT_METHOD_CHOICES,
      value: values.paymentMethod || NO_PROPERTY_OPTION,
      apply: (paymentMethod) => update({ paymentMethod: paymentMethod === NO_PROPERTY_OPTION ? "" : paymentMethod }),
    },
  };
  const sheet = openSheet ? sheets[openSheet] : null;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
      <ScrollView
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
          <PickerField label="Channel" onPress={() => setOpenSheet("channel")} value={choiceLabel(CHANNEL_OPTIONS, values.channel)} />
          <PickerField label="Payment method" onPress={() => setOpenSheet("paymentMethod")} value={choiceLabel(PAYMENT_METHOD_CHOICES, values.paymentMethod)} />
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, minHeight: MIN_TOUCH_TARGET }}>
            <Text style={{ flex: 1, fontSize: fontSize.md, color: colors.foreground }}>Include in tax reports</Text>
            <Switch
              accessibilityLabel="Include in tax reports"
              onValueChange={(taxRelevant) => update({ taxRelevant })}
              value={values.taxRelevant}
            />
          </View>
        </View>
        <LoadingButton isLoading={isSaving} loadingText="Adding…" onPress={save}>
          Add transaction
        </LoadingButton>
      </ScrollView>

      <OptionSheet
        isOpen={sheet !== null}
        onClose={() => setOpenSheet(null)}
        onSelect={(value) => {
          sheet?.apply(value);
          setOpenSheet(null);
        }}
        options={sheet?.options ?? []}
        title={openSheet ? SHEET_TITLES[openSheet] : ""}
        value={sheet?.value ?? ""}
      />
    </KeyboardAvoidingView>
  );
}
