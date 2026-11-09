import { useDeleteInsurancePolicyAttachmentMutation, useLazyGetInsurancePolicyByIdQuery } from "@mybookkeeper/api-client/store/insurancePoliciesApi";
import type { InsurancePolicyAttachment } from "@mybookkeeper/api-client/types/insurance/insurance-policy-attachment";
import { LoadingButton, useTheme, useToast } from "@platform/mobile";
import { useRef, useState } from "react";
import { Alert, Text, View } from "react-native";
import { INSURANCE_MESSAGES } from "../../constants/insurance";
import { POLICY_ATTACHMENT_MESSAGES } from "../../constants/insuranceForm";
import { useOpenFreshAttachment } from "../documents/useOpenFreshAttachment";
import { useCanWrite } from "../workspace/useCanWrite";
import PolicyAttachmentSheet from "./PolicyAttachmentSheet";
import { attachmentRemoveFailure } from "./policyFailure";
import PolicyFileRow from "./PolicyFileRow";

interface PolicyAttachmentsSectionProps {
  policyId: string;
  attachments: readonly InsurancePolicyAttachment[];
}

export default function PolicyAttachmentsSection({ policyId, attachments }: PolicyAttachmentsSectionProps) {
  const { colors, spacing, fontSize } = useTheme();
  const { showToast } = useToast();
  const canWrite = useCanWrite();
  const [fetchPolicy] = useLazyGetInsurancePolicyByIdQuery();
  const [removeAttachment] = useDeleteInsurancePolicyAttachmentMutation();
  const [isAdding, setIsAdding] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const isRemoving = useRef(false);
  const { open, openingId } = useOpenFreshAttachment<InsurancePolicyAttachment>(
    async () => (await fetchPolicy(policyId).unwrap()).attachments,
    INSURANCE_MESSAGES.couldntOpen,
  );

  async function remove(file: InsurancePolicyAttachment): Promise<void> {
    if (isRemoving.current) return;
    isRemoving.current = true;
    setRemovingId(file.id);
    try {
      await removeAttachment({ policyId, attachmentId: file.id }).unwrap();
      showToast(POLICY_ATTACHMENT_MESSAGES.removed);
    } catch (error) {
      showToast(attachmentRemoveFailure(error), "error");
    } finally {
      isRemoving.current = false;
      setRemovingId(null);
    }
  }

  function confirmRemove(file: InsurancePolicyAttachment): void {
    Alert.alert(POLICY_ATTACHMENT_MESSAGES.removeTitle, `${file.filename}. ${POLICY_ATTACHMENT_MESSAGES.removeBody}`, [
      { text: POLICY_ATTACHMENT_MESSAGES.cancel, style: "cancel" },
      { text: POLICY_ATTACHMENT_MESSAGES.remove, style: "destructive", onPress: () => void remove(file) },
    ]);
  }

  const isBusy = openingId !== null || removingId !== null;
  return (
    <View style={{ gap: spacing.md }}>
      <Text accessibilityRole="header" style={{ fontSize: fontSize.md, fontWeight: "600", color: colors.foreground }}>
        {INSURANCE_MESSAGES.documents}
      </Text>
      {attachments.length === 0 ? (
        <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{INSURANCE_MESSAGES.noDocuments}</Text>
      ) : (
        attachments.map((file) => (
          <PolicyFileRow
            file={file}
            isDisabled={isBusy}
            isOpening={openingId === file.id}
            isRemoving={removingId === file.id}
            key={file.id}
            onOpen={() => void open(file)}
            onRemove={canWrite ? () => confirmRemove(file) : undefined}
          />
        ))
      )}
      {canWrite ? (
        <LoadingButton disabled={isBusy} onPress={() => setIsAdding(true)} variant="secondary">
          {POLICY_ATTACHMENT_MESSAGES.addFile}
        </LoadingButton>
      ) : null}
      {isAdding ? <PolicyAttachmentSheet onClose={() => setIsAdding(false)} policyId={policyId} /> : null}
    </View>
  );
}
