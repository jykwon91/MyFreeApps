import type { TranscriptEntry } from "@mylanguagetutor/api-client/types/session/transcript-entry";

export interface TranscriptItemProps {
  entry: TranscriptEntry;
  languageName: string;
  /** Only the latest turn offers "say it again". */
  showRetryPrompt: boolean;
  busy: boolean;
  onTryRetry: () => void;
  onSkipRetry: (key: string) => void;
}
