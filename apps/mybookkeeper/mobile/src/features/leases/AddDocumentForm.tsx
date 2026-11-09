import { useAddSignedLeaseTemplatesMutation } from "@mybookkeeper/api-client/store/signedLeasesApi";
import type { SignedLeaseTemplatePrefillItem } from "@mybookkeeper/api-client/types/lease/signed-lease-template-prefill";
import { prefillItemsToAsk, prefillProblems, prefillProvenanceLabel } from "@mybookkeeper/api-client/utils/leasePrefill";
import { Banner, LoadingButton, useTheme, useToast } from "@platform/mobile";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { documentsMade, LEASE_DOCUMENT_MESSAGES as MESSAGES, prefillCaption } from "../../constants/leaseDocuments";
import { useDiscardPrompt } from "../../lib/useDiscardPrompt";
import { useWrite } from "../../lib/useWrite";
import type { PlaceholderEdits } from "../../types/PlaceholderEdits";
import PlaceholderField from "../newLease/PlaceholderField";
import { ADD_DOCUMENT_COPY } from "./addDocumentFailure";
import { documentValue, documentValuesChanged, documentValues } from "./documentValues";
import { useLeaveToLease } from "./useLeaveToLease";

interface AddDocumentFormProps {
  leaseId: string;
  templateIds: readonly string[];
  /** Picked templates that are already on the lease, which are made again. */
  isRemake: boolean;
  items: readonly SignedLeaseTemplatePrefillItem[];
}

export default function AddDocumentForm({ leaseId, templateIds, isRemake, items }: AddDocumentFormProps) {
  const { colors, spacing, fontSize } = useTheme();
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  const [addTemplates] = useAddSignedLeaseTemplatesMutation();
  const write = useWrite();
  const { isLeaving, leave } = useLeaveToLease(leaseId);
  const [edits, setEdits] = useState<PlaceholderEdits>({});
  const [hasTried, setHasTried] = useState(false);
  const asked = prefillItemsToAsk(items);
  const problems = prefillProblems(items, documentValues(items, edits));
  const locked = write.isBusy || isLeaving;

  useDiscardPrompt(documentValuesChanged(items, edits) && !isLeaving, write.isBusy);

  async function make(): Promise<void> {
    setHasTried(true);
    if (Object.keys(problems).length > 0) return;
    const result = await write.run(() => addTemplates({ leaseId, templateIds: [...templateIds], values: documentValues(items, edits) }).unwrap(), { staysLocked: true });
    if (result !== "done") return;
    showToast(documentsMade(templateIds.length, isRemake));
    leave();
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ gap: spacing.lg, padding: spacing.lg }} contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled" testID="add-document-form">
        <View style={{ gap: spacing.xs }}>
          <Text accessibilityRole="header" style={{ fontSize: fontSize.xl, fontWeight: "600", color: colors.foreground }}>
            {MESSAGES.fillTitle}
          </Text>
          <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{asked.length === 0 ? MESSAGES.nothingToFill : MESSAGES.fillBody}</Text>
        </View>
        {write.failure ? <Banner message={ADD_DOCUMENT_COPY[write.failure]} /> : null}
        {asked.map((item) => {
          const provenance = prefillProvenanceLabel(item);
          const isEdited = documentValue(item, edits) !== item.value;
          const problem = problems[item.key];
          return (
            <PlaceholderField
              caption={isEdited || !provenance ? null : prefillCaption(provenance)}
              error={hasTried && problem ? (problem === "required" ? MESSAGES.required : MESSAGES.notANumber) : undefined}
              inputType={item.input_type}
              isDisabled={locked}
              key={item.key}
              label={item.display_label}
              onChange={(value) => setEdits((current) => ({ ...current, [item.key]: value }))}
              required={item.required}
              value={documentValue(item, edits)}
            />
          );
        })}
      </ScrollView>
      <View
        style={{
          paddingHorizontal: spacing.lg,
          paddingTop: spacing.md,
          paddingBottom: insets.bottom + spacing.md,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          backgroundColor: colors.background,
        }}
      >
        <LoadingButton disabled={locked} isLoading={write.isBusy} loadingText={MESSAGES.making} onPress={() => void make()}>
          {MESSAGES.make}
        </LoadingButton>
      </View>
    </KeyboardAvoidingView>
  );
}
