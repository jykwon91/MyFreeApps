import {
  RECONCILIATION_DEFAULT_SOURCE_TYPE,
  RECONCILIATION_SOURCE_TYPES,
} from "@mybookkeeper/api-client/constants/reconciliationSourceTypes";
import { useUpload1099Mutation } from "@mybookkeeper/api-client/store/reconciliationApi";
import { Banner, FormField, LoadingButton, OptionSheet, useTheme, useToast } from "@platform/mobile";
import { Text } from "react-native";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, ScrollView } from "react-native";
import { DOCUMENTS_LINK, ISSUER_MAX_LENGTH, RECONCILIATION_MESSAGES as MESSAGES } from "../../constants/reconciliation";
import PickerField from "../transactions/PickerField";
import { reportedAmountError, sourceTypeLabel } from "./reconciliationDisplay";
import { addFailureMessage } from "./reconciliationFailure";
import { useConfirmLeave } from "../../lib/useConfirmLeave";

export default function ReconciliationAddForm({ year }: { year: number }) {
  const { colors, spacing, fontSize } = useTheme();
  const { showToast } = useToast();
  const [upload1099, { isLoading }] = useUpload1099Mutation();
  const isSending = useRef(false);
  const [sourceType, setSourceType] = useState(RECONCILIATION_DEFAULT_SOURCE_TYPE);
  const [issuer, setIssuer] = useState("");
  const [amount, setAmount] = useState("");
  const [hasTried, setHasTried] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [isChoosingType, setIsChoosingType] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);

  const isDirty = sourceType !== RECONCILIATION_DEFAULT_SOURCE_TYPE || issuer !== "" || amount !== "";
  const amountProblem = reportedAmountError(amount);

  useConfirmLeave(isDirty && !isLeaving, (leave) => {
    if (isSending.current) return;
    Alert.alert(MESSAGES.discardTitle, MESSAGES.discardBody, [
      { text: MESSAGES.keepEditing, style: "cancel" },
      { text: MESSAGES.discard, style: "destructive", onPress: leave },
    ]);
  });

  useEffect(() => {
    if (isLeaving) router.back();
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
        reported_amount: amount.trim(),
      }).unwrap();
      showToast(MESSAGES.added);
      setIsLeaving(true);
    } catch (error) {
      setFailure(addFailureMessage(error));
      isSending.current = false;
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
      <ScrollView
        contentContainerStyle={{ gap: spacing.lg, padding: spacing.lg }}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
      >
        {failure ? <Banner message={failure} /> : null}
        <PickerField label={MESSAGES.type} onPress={() => setIsChoosingType(true)} value={sourceTypeLabel(sourceType)} />
        <FormField hint={MESSAGES.issuerHint} label={MESSAGES.issuer} maxLength={ISSUER_MAX_LENGTH} onChangeText={setIssuer} value={issuer} />
        <FormField
          error={hasTried ? amountProblem : undefined}
          keyboardType="decimal-pad"
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
      </ScrollView>
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
    </KeyboardAvoidingView>
  );
}
