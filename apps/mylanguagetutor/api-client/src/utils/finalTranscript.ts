import type { HeardSpeech } from "../types/speech/heard-speech";
import { liveTranscript } from "./liveTranscript";

/**
 * The words to send once listening ends. Some recognizers end without promoting the last interim
 * result to final when the learner taps stop: then it falls back to that, rather than lose the turn.
 */
export function finalTranscript(heard: HeardSpeech): string {
  return (heard.finalText || liveTranscript(heard)).trim();
}
