import { IGNORED_RECOGNITION_ERRORS, NO_SPEECH_RECOGNITION_ERRORS } from "../constants/recognitionErrors";
import type { RecognitionAttempt } from "../types/speech/recognition-attempt";
import { endedNormally } from "./endedNormally";

/**
 * Whether what was heard before a recognition error is still sent. It is when the learner went quiet,
 * asked to send, or the recognizer had already settled on a final result; any other error cut the
 * learner off mid-answer, so a half answer is dropped, not sent. An abort (the app stopped listening:
 * background, leaving the screen) always drops.
 */
export function keepsHeardSpeech(error: string, attempt: RecognitionAttempt): boolean {
  if (IGNORED_RECOGNITION_ERRORS.has(error)) return false;
  return endedNormally(attempt) || NO_SPEECH_RECOGNITION_ERRORS.has(error);
}
