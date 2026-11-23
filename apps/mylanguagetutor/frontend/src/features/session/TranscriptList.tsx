import TranscriptItem from "@/features/session/TranscriptItem";
import TypingDots from "@/features/session/TypingDots";
import { useFollowTranscript } from "@/features/session/useFollowTranscript";
import type { TranscriptEntry } from "@mylanguagetutor/api-client/types/session/transcript-entry";

interface TranscriptListProps {
  entries: TranscriptEntry[];
  languageName: string;
  canSpeak: boolean;
  /** False while the microphone is open: the tutor's voice would be heard as the answer. */
  canReplay: boolean;
  /** Sent, no reply text yet: show typing dots. */
  waiting: boolean;
  busy: boolean;
  onReplay: (text: string, slow: boolean) => void;
  onTryRetry: () => void;
  onSkipRetry: (key: string) => void;
}

/** The conversation so far; keeps the newest exchange in view while the reader is at the end. Not a live region: the practice screen announces the finished reply. */
export default function TranscriptList({
  entries,
  languageName,
  canSpeak,
  canReplay,
  waiting,
  busy,
  onReplay,
  onTryRetry,
  onSkipRetry,
}: TranscriptListProps) {
  const last = entries[entries.length - 1];
  const end = useFollowTranscript(last?.key, entries, waiting);

  return (
    <div className="space-y-4">
      <ol className="space-y-4">
        {entries.map((entry) => (
          <TranscriptItem
            key={entry.key}
            entry={entry}
            languageName={languageName}
            canSpeak={canSpeak}
            canReplay={canReplay}
            showRetryPrompt={entry === last}
            busy={busy}
            onReplay={onReplay}
            onTryRetry={onTryRetry}
            onSkipRetry={onSkipRetry}
          />
        ))}
      </ol>
      {waiting && <TypingDots />}
      <div ref={end} />
    </div>
  );
}
