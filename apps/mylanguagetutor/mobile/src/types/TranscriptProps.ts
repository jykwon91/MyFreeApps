import type { TranscriptEntry } from "@mylanguagetutor/api-client/types/session/transcript-entry";

export interface TranscriptProps {
  entries: TranscriptEntry[];
  languageName: string;
  /** Sent, and no reply text yet: show the typing dots. */
  waiting: boolean;
  busy: boolean;
  onTryRetry: () => void;
  onSkipRetry: (key: string) => void;
}
