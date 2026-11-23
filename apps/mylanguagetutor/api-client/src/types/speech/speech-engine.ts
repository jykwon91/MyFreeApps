import type { QueuedSentence } from "./queued-sentence";

/**
 * A platform's text-to-speech (the browser's speechSynthesis, the phone's expo-speech) as the shared
 * speech queue drives it. Keep each function stable across renders.
 */
export interface SpeechEngine {
  /** Start saying ``text`` (already made speakable) and call ``sentence.done`` once it has been said, stopped or failed. */
  speak: (text: string, rate: number, sentence: QueuedSentence) => void;
  /** Stop all speech now. */
  stop: () => void;
  /** Whether the engine can take ``text`` at all; a sentence it can't is never queued. */
  canSpeak: (text: string) => boolean;
}
