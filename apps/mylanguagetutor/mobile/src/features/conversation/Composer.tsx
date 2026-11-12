import { VOICE_COPY } from "@mylanguagetutor/api-client/constants/voiceCopy";
import { typedAnswerLabel } from "@mylanguagetutor/api-client/utils/typedAnswerLabel";
import { LoadingButton, useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import { PHONE_VOICE_COPY } from "../../constants/voice";
import type { ComposerProps } from "../../types/ComposerProps";
import MicDeniedNotice from "./MicDeniedNotice";
import TypedComposer from "./TypedComposer";
import VoiceComposer from "./VoiceComposer";
import VoicePrivacyNotice from "./VoicePrivacyNotice";

/**
 * How the learner answers, as the website's practice page lays it out: speaking (after the privacy
 * notice, once), the blocked-microphone notice, or typing, with a way back to the microphone. Nothing
 * while it's still being found out which privacy notice applies, which takes a moment.
 */
export default function Composer({ voice, recognition, privacy, busy, ...typed }: ComposerProps) {
  const { colors, spacing, fontSize } = useTheme();
  switch (voice.view) {
    case "blocked":
      return null;
    case "denied":
      return <MicDeniedNotice onTypeInstead={voice.switchToText} />;
    case "privacy":
      return privacy ? <VoicePrivacyNotice onContinue={voice.acceptPrivacy} onTypeInstead={voice.switchToText} privacy={privacy} /> : null;
    case "voice":
      return (
        <VoiceComposer
          failure={recognition.failure}
          interim={recognition.interim}
          micDisabled={busy}
          onStart={voice.startListening}
          onStop={recognition.stop}
          onTypeInstead={voice.switchToText}
          phase={voice.phase}
        />
      );
    case "text":
      return (
        <View style={{ gap: spacing.sm }}>
          <TypedComposer {...typed} busy={busy} label={typedAnswerLabel(recognition.supported)} />
          {recognition.supported ? (
            <LoadingButton onPress={voice.switchToVoice} variant="ghost">
              {VOICE_COPY.useMicrophone}
            </LoadingButton>
          ) : (
            <Text style={{ color: colors.mutedForeground, fontSize: fontSize.xs }}>{PHONE_VOICE_COPY.typingOnlyNote}</Text>
          )}
        </View>
      );
  }
}
