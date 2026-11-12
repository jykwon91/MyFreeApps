import { VOICE_COPY } from "@mylanguagetutor/api-client/constants/voiceCopy";
import { LoadingButton, useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import type { VoicePrivacyNoticeProps } from "../../types/VoicePrivacyNoticeProps";
import { recognizerPrivacyCopy } from "../../utils/recognizerPrivacyCopy";

/**
 * Shown before the phone first asks for the microphone, as on the website, so the learner knows where
 * their voice and words go before allowing it. Shown again only if the phone would now send audio
 * where the notice they read said it wouldn't.
 */
export default function VoicePrivacyNotice({ privacy, onContinue, onTypeInstead }: VoicePrivacyNoticeProps) {
  const { colors, spacing, radius, fontSize } = useTheme();
  const lines = [recognizerPrivacyCopy(privacy), VOICE_COPY.privacyTutor, VOICE_COPY.privacySaved];
  return (
    <View style={{ gap: spacing.md, padding: spacing.lg, borderWidth: 1, borderRadius: radius.md, borderColor: colors.border }}>
      <Text accessibilityRole="header" style={{ color: colors.foreground, fontSize: fontSize.md, fontWeight: "600" }}>
        {VOICE_COPY.privacyHeading}
      </Text>
      {lines.map((line) => (
        <Text key={line} style={{ color: colors.mutedForeground, fontSize: fontSize.sm }}>
          {`• ${line}`}
        </Text>
      ))}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
        <LoadingButton onPress={onContinue}>{VOICE_COPY.privacyContinue}</LoadingButton>
        <LoadingButton onPress={onTypeInstead} variant="secondary">
          {VOICE_COPY.typeInstead}
        </LoadingButton>
      </View>
    </View>
  );
}
