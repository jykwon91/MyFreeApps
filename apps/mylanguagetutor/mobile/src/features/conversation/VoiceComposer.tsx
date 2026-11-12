import { VOICE_COPY } from "@mylanguagetutor/api-client/constants/voiceCopy";
import { recognitionFailureHint } from "@mylanguagetutor/api-client/utils/recognitionFailureHint";
import { LoadingButton, useAnnouncement, useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import type { VoiceComposerProps } from "../../types/VoiceComposerProps";
import MicButton from "./MicButton";

/**
 * The microphone, the words as they're heard, and a way to switch to typing, as on the website. What
 * went wrong with the last try ("didn't catch that") is told to screen readers; the words being heard
 * aren't, since the microphone would hear them.
 */
export default function VoiceComposer({ phase, interim, failure, micDisabled, onStart, onStop, onTypeInstead }: VoiceComposerProps) {
  const { colors, spacing, fontSize } = useTheme();
  const hint = recognitionFailureHint(failure);
  useAnnouncement(hint ?? undefined, "polite");
  return (
    <View style={{ alignItems: "center", gap: spacing.md }}>
      {phase === "listening" ? (
        <Text style={{ color: colors.mutedForeground, fontSize: fontSize.sm, fontStyle: "italic", textAlign: "center" }} testID="heard-so-far">
          {interim || VOICE_COPY.listening}
        </Text>
      ) : null}
      {hint ? <Text style={{ color: colors.mutedForeground, fontSize: fontSize.sm, textAlign: "center" }}>{hint}</Text> : null}
      <MicButton disabled={micDisabled} onStart={onStart} onStop={onStop} phase={phase} />
      <LoadingButton onPress={onTypeInstead} variant="ghost">
        {VOICE_COPY.typeInstead}
      </LoadingButton>
    </View>
  );
}
