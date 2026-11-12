export interface TutorVoiceControls {
  /** Queue one sentence (glosses, markdown and emoji left out) behind anything already queued. */
  enqueue: (sentence: string, rate?: number) => void;
  /** Stop everything, then read `text` from the start, sentence by sentence. */
  speakAll: (text: string, rate: number) => void;
  /** Stop speaking now. */
  cancel: () => void;
}
