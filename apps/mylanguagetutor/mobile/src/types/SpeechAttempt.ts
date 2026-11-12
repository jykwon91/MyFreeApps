import type { HeardSpeech } from "@mylanguagetutor/api-client/types/speech/heard-speech";
import type { RecognitionAttempt } from "@mylanguagetutor/api-client/types/speech/recognition-attempt";
import type { SpeechAttemptStage } from "./SpeechAttemptStage";

/**
 * One tap-to-talk attempt. Its identity is the token the phone's events are checked against. What it
 * has come to (heard, settled, stop asked for, even if the stop is still pending) decides what an error means.
 */
export interface SpeechAttempt extends RecognitionAttempt {
  stage: SpeechAttemptStage;
  /** Stop or abort asked for before the phone said it had started: done once it has. */
  pending: "stop" | "abort" | null;
  /** What was heard is dropped rather than sent: aborted, or an error cut the learner off mid-answer. */
  dropped: boolean;
  heard: HeardSpeech;
}
