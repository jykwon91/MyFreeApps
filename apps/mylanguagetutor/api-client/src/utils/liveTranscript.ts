import type { HeardSpeech } from "../types/speech/heard-speech";

/** What to show while the learner is still talking. */
export function liveTranscript({ finalText, interimText }: HeardSpeech): string {
  return `${finalText}${interimText}`;
}
