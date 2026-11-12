import type { TranscriptEntry } from "@mylanguagetutor/api-client/types/session/transcript-entry";

export interface TranscriptProps {
  entries: TranscriptEntry[];
  languageName: string;
  /** Sent, and no reply text yet: show the typing dots. */
  waiting: boolean;
  busy: boolean;
  /** False while the microphone is open: the tutor's voice would be heard as the answer. */
  canReplay: boolean;
  /** Play a reply again; `slow` at the slower rate. */
  onReplay: (text: string, slow: boolean) => void;
  onTryRetry: () => void;
  onSkipRetry: (key: string) => void;
}
