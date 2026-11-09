import { INSURANCE_ATTACHMENT_KIND_LABELS } from "@mybookkeeper/api-client/types/insurance/insurance-attachment-kind";
import type { InsurancePolicyAttachment } from "@mybookkeeper/api-client/types/insurance/insurance-policy-attachment";
import { LoadingButton, useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import { INSURANCE_MESSAGES } from "../../constants/insurance";
import { POLICY_ATTACHMENT_MESSAGES } from "../../constants/insuranceForm";

interface PolicyFileRowProps {
  file: InsurancePolicyAttachment;
  isOpening: boolean;
  isRemoving: boolean;
  isDisabled: boolean;
  onOpen: () => void;
  /** Only given to someone who can change the policy. */
  onRemove?: () => void;
}

export default function PolicyFileRow({ file, isOpening, isRemoving, isDisabled, onOpen, onRemove }: PolicyFileRowProps) {
  const { colors, spacing, fontSize } = useTheme();
  return (
    <View style={{ gap: spacing.sm }}>
      <View style={{ gap: spacing.xs }}>
        <Text style={{ fontSize: fontSize.md, color: colors.foreground }}>{file.filename}</Text>
        <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{INSURANCE_ATTACHMENT_KIND_LABELS[file.kind]}</Text>
      </View>
      {file.is_available === false ? (
        <Text style={{ fontSize: fontSize.sm, color: colors.destructive }}>{INSURANCE_MESSAGES.fileMissing}</Text>
      ) : (
        <LoadingButton
          accessibilityLabel={`${INSURANCE_MESSAGES.open} ${file.filename}`}
          disabled={isDisabled}
          isLoading={isOpening}
          onPress={onOpen}
          variant="secondary"
        >
          {INSURANCE_MESSAGES.open}
        </LoadingButton>
      )}
      {onRemove ? (
        <LoadingButton
          accessibilityLabel={`${POLICY_ATTACHMENT_MESSAGES.remove} ${file.filename}`}
          disabled={isDisabled}
          isLoading={isRemoving}
          loadingText={POLICY_ATTACHMENT_MESSAGES.removing}
          onPress={onRemove}
          variant="ghost"
        >
          {POLICY_ATTACHMENT_MESSAGES.remove}
        </LoadingButton>
      ) : null}
    </View>
  );
}
