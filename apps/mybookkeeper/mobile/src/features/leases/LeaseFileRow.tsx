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
  onOpen: () => void;
}

export default function LeaseFileRow({ leaseId, file, isOpening, isDisabled, onOpen }: LeaseFileRowProps) {
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
      {canWrite ? <LeaseFileActions file={file} isDisabled={isOpening || isDisabled} leaseId={leaseId} /> : null}
    </View>
  );
}
