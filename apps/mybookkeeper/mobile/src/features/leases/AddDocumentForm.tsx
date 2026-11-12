import { useAddSignedLeaseTemplatesMutation, useGetSignedLeaseByIdQuery } from "@mybookkeeper/api-client/store/signedLeasesApi";
import type { SignedLeaseTemplatePrefillItem } from "@mybookkeeper/api-client/types/lease/signed-lease-template-prefill";
import { LEASE_DOCUMENTS_LOCKED_MESSAGE, LEASE_VALUE_LOCKED_MESSAGE, LEASE_VALUE_READ_ONLY_NOTE } from "@mybookkeeper/api-client/constants/leaseDocumentsLocked";
import { isLeaseDocumentsLockedFailure } from "@mybookkeeper/api-client/utils/isLeaseDocumentsLockedFailure";
import { isLeaseValueLockedFailure } from "@mybookkeeper/api-client/utils/isLeaseValueLockedFailure";
import { prefillItemsToAsk, prefillProblems, prefillProvenanceLabel } from "@mybookkeeper/api-client/utils/leasePrefill";
import { Banner, HeaderKeyboardAvoidingView, LoadingButton, PinnedBar, useDiscardPrompt, useTheme, useToast } from "@platform/mobile";
import { router } from "expo-router";
import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { documentsMade, LEASE_DOCUMENT_MESSAGES as MESSAGES, prefillCaption } from "../../constants/leaseDocuments";
import { PLACEHOLDER_PROBLEM_MESSAGES } from "../../constants/placeholderProblems";
import { useWrite } from "../../lib/useWrite";
import type { PlaceholderEdits } from "@mybookkeeper/api-client/types/lease/placeholder-edits";
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
  /** The lease locked after the fields were shown: ask the server again so saved values turn read-only. */
  onPrefillStale: () => void;
}

export default function AddDocumentForm({ leaseId, templateIds, isRemake, items, onPrefillStale }: AddDocumentFormProps) {
  const { colors, spacing, fontSize } = useTheme();
  const { showToast } = useToast();
  const [addTemplates] = useAddSignedLeaseTemplatesMutation();
  const { refetch: refetchLease } = useGetSignedLeaseByIdQuery(leaseId);
  const write = useWrite();
  const { isLeaving, leave } = useLeaveToLease(leaseId);
  const [edits, setEdits] = useState<PlaceholderEdits>({});
  const [hasTried, setHasTried] = useState(false);
  const asked = prefillItemsToAsk(items);
  const problems = prefillProblems(items, documentValues(items, edits));
  const locked = write.isBusy || isLeaving;

  useDiscardPrompt((documentValuesChanged(items, edits) || write.isBusy) && !isLeaving, write.isBusy);

  async function make(): Promise<void> {
    setHasTried(true);
    if (Object.keys(problems).length > 0) return;
    const result = await write.run(
      () =>
        addTemplates({ leaseId, templateIds: [...templateIds], values: documentValues(items, edits) })
          .unwrap()
          .catch((error: unknown) => {
            // The lease was sent or emailed meanwhile: learn its new state so the picker and files catch up.
            if (isLeaseDocumentsLockedFailure(error)) void refetchLease();
            if (isLeaseValueLockedFailure(error)) {
              void refetchLease();
              onPrefillStale();
            }
            throw error;
          }),
      { staysLocked: true },
    );
    if (result !== "done") return;
    showToast(documentsMade(templateIds.length, isRemake));
    leave();
  }

  return (
    <HeaderKeyboardAvoidingView>
      <ScrollView contentContainerStyle={{ gap: spacing.lg, padding: spacing.lg }} contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled" testID="add-document-form">
        <View style={{ gap: spacing.xs }}>
          <Text accessibilityRole="header" style={{ fontSize: fontSize.xl, fontWeight: "600", color: colors.foreground }}>
            {MESSAGES.fillTitle}
          </Text>
          <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{asked.length === 0 ? MESSAGES.nothingToFill : MESSAGES.fillBody}</Text>
        </View>
        {write.failure ? (
          isLeaseDocumentsLockedFailure(write.error) ? (
            // The picker behind this screen has caught up with the lock, so going back shows what can still be picked.
            <Banner actions={[{ label: MESSAGES.backToPicking, onPress: () => router.back() }]} message={LEASE_DOCUMENTS_LOCKED_MESSAGE} />
          ) : isLeaseValueLockedFailure(write.error) ? (
            <Banner message={LEASE_VALUE_LOCKED_MESSAGE} />
          ) : (
            <Banner message={ADD_DOCUMENT_COPY[write.failure]} />
          )
        ) : null}
        {asked.map((item) => {
          const provenance = prefillProvenanceLabel(item);
          const isEdited = documentValue(item, edits) !== item.value;
          const problem = problems[item.key];
          return (
            <PlaceholderField
              caption={item.is_read_only ? LEASE_VALUE_READ_ONLY_NOTE : isEdited || !provenance ? null : prefillCaption(provenance)}
              error={hasTried && problem ? (PLACEHOLDER_PROBLEM_MESSAGES[problem]) : undefined}
              inputType={item.input_type}
              isDisabled={locked || item.is_read_only}
              key={item.key}
              label={item.display_label}
              onChange={(value) => setEdits((current) => ({ ...current, [item.key]: value }))}
              required={item.required}
              value={documentValue(item, edits)}
            />
          );
        })}
      </ScrollView>
      <PinnedBar
        bottomSpacing={spacing.md}
        style={{
          paddingHorizontal: spacing.lg,
          paddingTop: spacing.md,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          backgroundColor: colors.background,
        }}
      >
        <LoadingButton disabled={locked} isLoading={write.isBusy} loadingText={MESSAGES.making} onPress={() => void make()}>
          {MESSAGES.make}
        </LoadingButton>
      </PinnedBar>
    </HeaderKeyboardAvoidingView>
  );
}
