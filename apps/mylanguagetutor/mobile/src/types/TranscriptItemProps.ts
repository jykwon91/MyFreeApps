import type { TranscriptEntry } from "@mylanguagetutor/api-client/types/session/transcript-entry";

export interface TranscriptItemProps {
  entry: TranscriptEntry;
  languageName: string;
  /** Only the latest turn offers "say it again". */
  showRetryPrompt: boolean;
  busy: boolean;
  /** Play a reply again; `slow` at the slower rate. */
  onReplay: (text: string, slow: boolean) => void;
  onTryRetry: () => void;
  onSkipRetry: (key: string) => void;
}
