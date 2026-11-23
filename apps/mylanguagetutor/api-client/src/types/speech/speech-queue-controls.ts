/** The tutor's voice, on the website and the phone. */
export interface SpeechQueueControls {
  /** True from the first sentence queued until the last has been said or speech stopped. */
  speaking: boolean;
  /** Queue one sentence (glosses, markdown and emoji left out) behind anything already queued. */
  enqueue: (sentence: string, rate?: number) => void;
  /** Stop everything, then read ``text`` from the start, sentence by sentence. */
  speakAll: (text: string, rate?: number) => void;
  /** Stop speaking now (barge-in). */
  cancel: () => void;
}
