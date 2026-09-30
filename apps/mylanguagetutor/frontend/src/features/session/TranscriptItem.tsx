import LearnerBubble from "@/features/session/LearnerBubble";
import TutorBubble from "@/features/session/TutorBubble";
import CorrectionList from "@/features/session/CorrectionList";
import RetryPrompt from "@/features/session/RetryPrompt";
import type { TranscriptEntry } from "@/types/session/transcript-entry";

interface TranscriptItemProps {
  entry: TranscriptEntry;
  languageName: string;
  canSpeak: boolean;
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
          onReplay={() => onReplay(entry.replyText, false)}
          onReplaySlow={() => onReplay(entry.replyText, true)}
        />
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
