import { useEffect, useRef } from "react";
import TranscriptItem from "@/features/session/TranscriptItem";
import TypingDots from "@/features/session/TypingDots";
import type { TranscriptEntry } from "@/types/session/transcript-entry";

interface TranscriptListProps {
  entries: TranscriptEntry[];
  languageName: string;
  canSpeak: boolean;
  /** Sent, no reply text yet: show typing dots. */
  waiting: boolean;
  busy: boolean;
  onReplay: (text: string, slow: boolean) => void;
  onTryRetry: () => void;
  onSkipRetry: (key: string) => void;
}

/** The conversation so far; keeps the newest exchange in view. */
export default function TranscriptList({
  entries,
  languageName,
  canSpeak,
  waiting,
  busy,
  onReplay,
  onTryRetry,
  onSkipRetry,
}: TranscriptListProps) {
  const end = useRef<HTMLDivElement>(null);
  const last = entries[entries.length - 1];

  useEffect(() => {
    end.current?.scrollIntoView?.({ behavior: "smooth", block: "end" });
  }, [entries, waiting]);

  return (
    <div className="space-y-4" aria-live="polite">
      <ol className="space-y-4">
        {entries.map((entry) => (
          <TranscriptItem
            key={entry.key}
            entry={entry}
            languageName={languageName}
            canSpeak={canSpeak}
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
