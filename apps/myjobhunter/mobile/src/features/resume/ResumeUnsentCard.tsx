import { LoadingButton, useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import { RESUME_MESSAGES as MESSAGES } from "../../constants/resume";
import type { ResumeUnsentCardProps } from "../../types/ResumeUnsentCardProps";

/** A file that didn't reach the server: sent again as it is, or let go of. */
export default function ResumeUnsentCard({ name, isRetrying, onRetry, onDiscard }: ResumeUnsentCardProps) {
  const { colors, spacing, radius, fontSize } = useTheme();
  return (
    <View
      style={{ gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card }}
      testID="resume-unsent"
    >
      <Text numberOfLines={2} style={{ color: colors.foreground, fontSize: fontSize.sm }}>
        {MESSAGES.notUploaded(name)}
      </Text>
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <LoadingButton accessibilityLabel={MESSAGES.retryUploadOf(name)} isLoading={isRetrying} loadingText={MESSAGES.uploading} onPress={onRetry}>
          {MESSAGES.retryUpload}
        </LoadingButton>
        <LoadingButton accessibilityLabel={MESSAGES.discardUploadOf(name)} disabled={isRetrying} onPress={onDiscard} variant="secondary">
          {MESSAGES.discardUpload}
        </LoadingButton>
      </View>
    </View>
  );
}
