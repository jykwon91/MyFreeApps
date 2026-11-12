import {
  DENIED_RECOGNITION_ERRORS,
  IGNORED_RECOGNITION_ERRORS,
  INTERRUPTED_RECOGNITION_ERRORS,
  MICROPHONE_LOST_RECOGNITION_ERRORS,
  NO_SPEECH_RECOGNITION_ERRORS,
} from "../constants/recognitionErrors";
import type { RecognitionAttempt } from "../types/speech/recognition-attempt";
import type { RecognitionFailure } from "../types/speech/recognition-failure";
import { endedNormally } from "./endedNormally";

/**
 * What a recognition error means for the learner, or null when it isn't one to show. After the answer
 * ended normally, only a refused microphone is shown. Losing the microphone after words were heard is
 * an interruption (a call, another app); with nothing heard it means the microphone is missing or
 * blocked (browsers and iOS report that as `audio-capture` even after starting), so recognition isn't
 * working.
 */
export function recognitionFailure(error: string, attempt: RecognitionAttempt): RecognitionFailure | null {
  if (IGNORED_RECOGNITION_ERRORS.has(error)) return null;
  if (DENIED_RECOGNITION_ERRORS.has(error)) return "denied";
  if (endedNormally(attempt)) return null;
  if (NO_SPEECH_RECOGNITION_ERRORS.has(error)) return "no_speech";
  if (INTERRUPTED_RECOGNITION_ERRORS.has(error)) return "interrupted";
  if (attempt.anythingHeard && MICROPHONE_LOST_RECOGNITION_ERRORS.has(error)) return "interrupted";
  return "unavailable";
}
