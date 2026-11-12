import {
  DENIED_RECOGNITION_ERRORS,
  IGNORED_RECOGNITION_ERRORS,
  NO_SPEECH_RECOGNITION_ERRORS,
} from "../constants/recognitionErrors";
import type { RecognitionFailure } from "../types/speech/recognition-failure";

/** What a recognition error means for the learner, or null when it isn't one to show. */
export function recognitionFailure(error: string): RecognitionFailure | null {
  if (IGNORED_RECOGNITION_ERRORS.has(error)) return null;
  if (DENIED_RECOGNITION_ERRORS.has(error)) return "denied";
  if (NO_SPEECH_RECOGNITION_ERRORS.has(error)) return "no_speech";
  return "unavailable";
}
