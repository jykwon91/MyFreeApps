import { VOICE_COPY } from "../constants/voiceCopy";
import type { RecognitionFailure } from "../types/speech/recognition-failure";

/** The line under the microphone after a failed attempt. A refused microphone gets its own screen instead. */
export function recognitionFailureHint(failure: RecognitionFailure | null): string | null {
  if (failure === "no_speech") return VOICE_COPY.noSpeech;
  if (failure === "interrupted") return VOICE_COPY.interrupted;
  if (failure === "unavailable") return VOICE_COPY.unavailable;
  return null;
}
