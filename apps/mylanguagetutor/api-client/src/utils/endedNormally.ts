import type { RecognitionAttempt } from "../types/speech/recognition-attempt";

/**
 * The attempt ended the way an answer ends: the learner asked to send it, or the recognizer settled
 * on a final result. What the recognizer reports after that (Android can answer a stop with `client`
 * or a no-match, or deliver an error queued behind its final result) belongs to an answer already
 * over: it neither drops what was heard nor shows the learner a failure.
 */
export function endedNormally({ settled, stopRequested }: RecognitionAttempt): boolean {
  return settled || stopRequested;
}
