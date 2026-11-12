import { VOICE_COPY } from "@mylanguagetutor/api-client/constants/voiceCopy";
import { LoadingButton, useAnnouncement, useTheme } from "@platform/mobile";
import { Linking, Text, View } from "react-native";
import { PHONE_VOICE_COPY } from "../../constants/voice";
import type { MicDeniedNoticeProps } from "../../types/MicDeniedNoticeProps";

function openSettings(): Promise<void> {
  return Linking.openSettings().catch((error: unknown) => console.warn("Couldn't open the phone's Settings", error));
}

/**
 * The learner refused the microphone (or, on iOS, speech recognition): how to allow it, with a way
 * there, and typing meanwhile. Coming back having allowed it brings the microphone back.
 */
export default function MicDeniedNotice({ onTypeInstead }: MicDeniedNoticeProps) {
  const { colors, spacing, radius, fontSize } = useTheme();
  useAnnouncement(VOICE_COPY.micBlocked, "polite");
  return (
    <View style={{ gap: spacing.md, padding: spacing.lg, borderWidth: 1, borderRadius: radius.md, borderColor: colors.border }}>
      <Text accessibilityRole="header" style={{ color: colors.foreground, fontSize: fontSize.md, fontWeight: "600" }}>
        {VOICE_COPY.micBlocked}
      </Text>
      <Text style={{ color: colors.mutedForeground, fontSize: fontSize.sm }}>{PHONE_VOICE_COPY.micBlockedBody}</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
        <LoadingButton onPress={openSettings}>{PHONE_VOICE_COPY.openSettings}</LoadingButton>
        <LoadingButton onPress={onTypeInstead} variant="secondary">
          {VOICE_COPY.typeInstead}
        </LoadingButton>
      </View>
    </View>
  );
}
