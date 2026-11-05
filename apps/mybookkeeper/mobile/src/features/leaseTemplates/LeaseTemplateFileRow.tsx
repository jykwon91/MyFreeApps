import type { LeaseTemplateFile } from "@mybookkeeper/api-client/types/lease/lease-template-file";
import { LoadingButton, useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import { LEASE_TEMPLATE_MESSAGES } from "../../constants/leaseTemplates";
import { templateFileLine } from "./leaseTemplateDisplay";

interface LeaseTemplateFileRowProps {
  file: LeaseTemplateFile;
  isOpening: boolean;
  isDisabled: boolean;
  onOpen: () => void;
}

export default function LeaseTemplateFileRow({ file, isOpening, isDisabled, onOpen }: LeaseTemplateFileRowProps) {
  const { colors, spacing, fontSize } = useTheme();
  return (
    <View style={{ gap: spacing.sm }}>
      <View style={{ gap: spacing.xs }}>
        <Text style={{ fontSize: fontSize.md, color: colors.foreground }}>{file.filename}</Text>
        <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{templateFileLine(file)}</Text>
      </View>
      {file.presigned_url ? (
        <LoadingButton
          accessibilityLabel={`${LEASE_TEMPLATE_MESSAGES.open} ${file.filename}`}
          disabled={isDisabled}
          isLoading={isOpening}
          onPress={onOpen}
          variant="secondary"
        >
          {LEASE_TEMPLATE_MESSAGES.open}
        </LoadingButton>
      ) : (
        <Text style={{ fontSize: fontSize.sm, color: colors.destructive }}>
          {file.is_available ? LEASE_TEMPLATE_MESSAGES.noFileLink : LEASE_TEMPLATE_MESSAGES.fileMissing}
        </Text>
      )}
    </View>
  );
}
