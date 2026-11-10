import { LEASE_RECORD_FILE_LOCKED_NOTE } from "@mybookkeeper/api-client/constants/leaseDocumentsLocked";
import type { SignedLeaseAttachment } from "@mybookkeeper/api-client/types/lease/signed-lease-attachment";
import { LoadingButton, useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import { LEASE_MESSAGES } from "../../constants/leases";
import { useCanWrite } from "../workspace/useCanWrite";
import { leaseFileLine } from "./leaseDisplay";
import LeaseFileActions from "./LeaseFileActions";

interface LeaseFileRowProps {
  leaseId: string;
  file: SignedLeaseAttachment;
  isOpening: boolean;
  isDisabled: boolean;
  /** The lease is sent, emailed or signed, so no file can be relabelled into a rendered original. */
  isDocumentsLocked: boolean;
  onOpen: () => void;
}

export default function LeaseFileRow({ leaseId, file, isOpening, isDisabled, isDocumentsLocked, onOpen }: LeaseFileRowProps) {
  const { colors, spacing, fontSize } = useTheme();
  const canWrite = useCanWrite();
  return (
    <View style={{ gap: spacing.sm }}>
      <View style={{ gap: spacing.xs }}>
        <Text style={{ fontSize: fontSize.md, color: colors.foreground }}>{file.filename}</Text>
        <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{leaseFileLine(file)}</Text>
      </View>
      {file.is_available ? (
        <LoadingButton
          accessibilityLabel={`${LEASE_MESSAGES.open} ${file.filename}`}
          disabled={isDisabled}
          isLoading={isOpening}
          onPress={onOpen}
          variant="secondary"
        >
          {LEASE_MESSAGES.open}
        </LoadingButton>
      ) : (
        <Text style={{ fontSize: fontSize.sm, color: colors.destructive }}>{LEASE_MESSAGES.fileMissing}</Text>
      )}
      {canWrite && file.is_locked ? (
        <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{LEASE_RECORD_FILE_LOCKED_NOTE}</Text>
      ) : canWrite ? (
        <LeaseFileActions file={file} isDocumentsLocked={isDocumentsLocked} isDisabled={isOpening || isDisabled} leaseId={leaseId} />
      ) : null}
    </View>
  );
}
