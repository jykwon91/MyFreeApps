import {
  RECONCILIATION_DEFAULT_SOURCE_TYPE,
  RECONCILIATION_SOURCE_TYPES,
} from "@mybookkeeper/api-client/constants/reconciliationSourceTypes";
import { useUpload1099Mutation } from "@mybookkeeper/api-client/store/reconciliationApi";
import { normalizeMoneyText } from "@mybookkeeper/api-client/utils/normalizeMoneyText";
import { Banner, confirmDiscard, deviceDecimalSeparator, FIELD_PRESETS, FormField, goBackOr, KeyboardAwareScroll, LoadingButton, OptionSheet, PickerField, useConfirmLeave, useFieldChain, useTheme, useToast } from "@platform/mobile";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Text } from "react-native";
import { DOCUMENTS_LINK, ISSUER_MAX_LENGTH, RECONCILIATION_MESSAGES as MESSAGES } from "../../constants/reconciliation";
import { reportedAmountError } from "@mybookkeeper/api-client/utils/reportedAmountError";
import { sourceTypeLabel } from "./reconciliationDisplay";
import { addFailureMessage } from "./reconciliationFailure";
import { isCancelledRequest } from "@platform/core/utils/isCancelledRequest";

export default function ReconciliationAddForm({ year }: { year: number }) {
  const { colors, spacing, fontSize } = useTheme();
  const { showToast } = useToast();
  const [upload1099, { isLoading }] = useUpload1099Mutation();
  const isSending = useRef(false);
  const [sourceType, setSourceType] = useState(RECONCILIATION_DEFAULT_SOURCE_TYPE);
  const [issuer, setIssuer] = useState("");
  const [decimalSeparator] = useState(deviceDecimalSeparator);
  const [amount, setAmount] = useState("");
  const [hasTried, setHasTried] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [isChoosingType, setIsChoosingType] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const fields = useFieldChain(["issuer", "amount"]);

  const isDirty = sourceType !== RECONCILIATION_DEFAULT_SOURCE_TYPE || issuer !== "" || amount !== "";
  const amountProblem = reportedAmountError(amount, decimalSeparator);

  useConfirmLeave(isDirty && !isLeaving, (leave) => {
    if (isSending.current) return;
    confirmDiscard(leave, MESSAGES);
  });

  useEffect(() => {
    if (isLeaving) goBackOr("/reconciliation");
  }, [isLeaving]);

  /** Stays locked after a save: the screen is still tappable while it slides away, and each send adds a form. */
  async function add(): Promise<void> {
    setHasTried(true);
    if (amountProblem || isSending.current) return;
    isSending.current = true;
    setFailure(null);
    try {
      await upload1099({
        source_type: sourceType,
        tax_year: year,
        issuer: issuer.trim() || undefined,
        // Checked by reportedAmountError above, so it reads.
        reported_amount: normalizeMoneyText(amount, decimalSeparator) ?? "",
      }).unwrap();
      showToast(MESSAGES.added);
      setIsLeaving(true);
    } catch (error) {
      isSending.current = false;
      if (!isCancelledRequest(error)) setFailure(addFailureMessage(error));
    }
  }

  return (
    <>
      <KeyboardAwareScroll
        contentContainerStyle={{ gap: spacing.lg, padding: spacing.lg }}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
      >
        {failure ? <Banner message={failure} /> : null}
        <PickerField label={MESSAGES.type} onPress={() => setIsChoosingType(true)} valueLabel={sourceTypeLabel(sourceType)} />
        <FormField {...fields.field("issuer")} hint={MESSAGES.issuerHint} label={MESSAGES.issuer} maxLength={ISSUER_MAX_LENGTH} onChangeText={setIssuer} value={issuer} />
        <FormField
          {...FIELD_PRESETS.decimal}
          {...fields.field("amount")}
          error={hasTried ? amountProblem : undefined}
          label={MESSAGES.amount}
          onChangeText={setAmount}
          value={amount}
        />
        <LoadingButton disabled={isLoading || isLeaving} isLoading={isLoading} loadingText={MESSAGES.adding} onPress={() => void add()}>
          {MESSAGES.add}
        </LoadingButton>
        <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{MESSAGES.pdfHint}</Text>
        <LoadingButton disabled={isLoading || isLeaving} onPress={() => router.push(DOCUMENTS_LINK)} variant="ghost">
          {MESSAGES.openDocuments}
        </LoadingButton>
      </KeyboardAwareScroll>
      <OptionSheet
        isOpen={isChoosingType}
        onClose={() => setIsChoosingType(false)}
        onSelect={(chosen) => {
          setIsChoosingType(false);
          setSourceType(chosen);
        }}
        options={RECONCILIATION_SOURCE_TYPES}
        title={MESSAGES.type}
        value={sourceType}
      />
    </>
  );
}
