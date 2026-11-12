import LearnerBubble from "@/features/session/LearnerBubble";
import TutorBubble from "@/features/session/TutorBubble";
import CorrectionList from "@/features/session/CorrectionList";
import RetryPrompt from "@/features/session/RetryPrompt";
import { PRACTICE_COPY } from "@mylanguagetutor/api-client/constants/practiceCopy";
import type { TranscriptEntry } from "@mylanguagetutor/api-client/types/session/transcript-entry";

interface TranscriptItemProps {
  entry: TranscriptEntry;
  languageName: string;
  canSpeak: boolean;
  /** False while the microphone is open: the tutor's voice would be heard as the answer. */
  canReplay: boolean;
  /** Only the latest turn offers "say it again". */
  showRetryPrompt: boolean;
  busy: boolean;
  onReplay: (text: string, slow: boolean) => void;
  onTryRetry: () => void;
  onSkipRetry: (key: string) => void;
}

/** One exchange: the learner's words, the tutor's reply, then any corrections. */
export default function TranscriptItem({
  entry,
  languageName,
  canSpeak,
  canReplay,
  showRetryPrompt,
  busy,
  onReplay,
  onTryRetry,
  onSkipRetry,
}: TranscriptItemProps) {
  return (
    <li className="space-y-2">
      <LearnerBubble text={entry.learnerText} />
      {entry.replyText && (
        <TutorBubble
          text={entry.replyText}
          translation={entry.translation}
          partial={entry.status === "partial" || entry.status === "failed"}
          canSpeak={canSpeak}
          canReplay={canReplay}
          onReplay={() => onReplay(entry.replyText, false)}
          onReplaySlow={() => onReplay(entry.replyText, true)}
        />
      )}
      {entry.correctionsMissing && (
        <p className="px-1 text-xs text-muted-foreground">{PRACTICE_COPY.correctionsMissing}</p>
      )}
      <CorrectionList corrections={entry.corrections} languageName={languageName} />
      {showRetryPrompt && entry.retryPrompt && (
        <RetryPrompt
          prompt={entry.retryPrompt}
          disabled={busy}
          onTry={onTryRetry}
          onSkip={() => onSkipRetry(entry.key)}
        />
      )}
    </li>
  );
}
