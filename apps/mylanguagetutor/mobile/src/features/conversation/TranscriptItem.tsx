import { PRACTICE_COPY } from "@mylanguagetutor/api-client/constants/practiceCopy";
import { useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import type { TranscriptItemProps } from "../../types/TranscriptItemProps";
import CorrectionList from "./CorrectionList";
import LearnerBubble from "./LearnerBubble";
import RetryPrompt from "./RetryPrompt";
import TutorBubble from "./TutorBubble";

/** One exchange: what the learner wrote, the tutor's reply, then any corrections. */
export default function TranscriptItem({ entry, languageName, showRetryPrompt, busy, canReplay, onReplay, onTryRetry, onSkipRetry }: TranscriptItemProps) {
  const { colors, spacing, fontSize } = useTheme();
  return (
    <View style={{ gap: spacing.sm }}>
      <LearnerBubble text={entry.learnerText} />
      {entry.replyText ? (
        <TutorBubble
          canReplay={canReplay}
          onReplay={() => onReplay(entry.replyText, false)}
          onReplaySlow={() => onReplay(entry.replyText, true)}
          partial={entry.status === "partial" || entry.status === "failed"}
          text={entry.replyText}
          translation={entry.translation}
        />
      ) : null}
      {entry.correctionsMissing ? (
        <Text style={{ paddingHorizontal: spacing.xs, color: colors.mutedForeground, fontSize: fontSize.xs }}>{PRACTICE_COPY.correctionsMissing}</Text>
      ) : null}
      <CorrectionList corrections={entry.corrections} languageName={languageName} />
      {showRetryPrompt && entry.retryPrompt ? (
        <RetryPrompt disabled={busy} onSkip={() => onSkipRetry(entry.key)} onTry={onTryRetry} prompt={entry.retryPrompt} />
      ) : null}
    </View>
  );
}
