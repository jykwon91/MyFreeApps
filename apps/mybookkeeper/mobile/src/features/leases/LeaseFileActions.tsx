import { LEASE_ATTACHMENT_KIND_LABELS } from "@mybookkeeper/api-client/constants/leaseLabels";
import type { LeaseAttachmentKind } from "@mybookkeeper/api-client/types/lease/lease-attachment-kind";
import type { SignedLeaseAttachment } from "@mybookkeeper/api-client/types/lease/signed-lease-attachment";
import { LoadingButton, OptionSheet, useTheme } from "@platform/mobile";
import { useRef, useState } from "react";
import { View } from "react-native";
import { changeTypeLabel, LEASE_FILE_KIND_CHOICES, LEASE_FILE_MESSAGES, removeLabel, removeTitle } from "../../constants/leaseFiles";
import type { LeaseFileAction } from "../../types/LeaseFileAction";
import { askOnce } from "./askOnce";
import { useLeaseFileActions } from "./useLeaseFileActions";

const KIND_OPTIONS = LEASE_FILE_KIND_CHOICES.map((kind) => ({ value: kind, label: LEASE_ATTACHMENT_KIND_LABELS[kind] }));

interface LeaseFileActionsProps {
  leaseId: string;
  file: SignedLeaseAttachment;
  /** Another file is being opened, so nothing else should start. */
  isDisabled: boolean;
}

/** What a writer can do with a file: mark it as another kind, or remove it. */
export default function LeaseFileActions({ leaseId, file, isDisabled }: LeaseFileActionsProps) {
  const { busy, changeKind, remove } = useLeaseFileActions(leaseId);
  const [isChoosing, setIsChoosing] = useState(false);
  const asking = useRef(false);
  const { spacing } = useTheme();
  const isBusy = busy !== null;
  const isThis = (action: LeaseFileAction) => busy?.id === file.id && busy.action === action;

  return (
    <View style={{ gap: spacing.sm }}>
      <LoadingButton
        accessibilityLabel={changeTypeLabel(file.filename)}
        disabled={isDisabled || isBusy}
        isLoading={isThis("change")}
        loadingText={LEASE_FILE_MESSAGES.changingType}
        onPress={() => setIsChoosing(true)}
        variant="ghost"
      >
        {LEASE_FILE_MESSAGES.changeType}
      </LoadingButton>
      <LoadingButton
        accessibilityLabel={removeLabel(file.filename)}
        disabled={isDisabled || isBusy}
        isLoading={isThis("remove")}
        loadingText={LEASE_FILE_MESSAGES.removing}
        onPress={() => askOnce(asking, removeTitle(file.filename), LEASE_FILE_MESSAGES.removeBody, { text: LEASE_FILE_MESSAGES.remove, style: "destructive", onPress: () => void remove(file) })}
        variant="ghost"
      >
        {LEASE_FILE_MESSAGES.remove}
      </LoadingButton>
      <OptionSheet<LeaseAttachmentKind>
        isOpen={isChoosing}
        onClose={() => setIsChoosing(false)}
        onSelect={(kind) => {
          setIsChoosing(false);
          void changeKind(file, kind);
        }}
        options={KIND_OPTIONS}
        title={LEASE_FILE_MESSAGES.typeSheetTitle}
        value={file.kind}
      />
    </View>
  );
}
