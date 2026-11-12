import type { HeardSpeech } from "@mylanguagetutor/api-client/types/speech/heard-speech";
import type { SpeechAttemptStage } from "./SpeechAttemptStage";

/** One tap-to-talk attempt. Its identity is the token the phone's events are checked against. */
export interface SpeechAttempt {
  stage: SpeechAttemptStage;
  /** Stop or abort asked for before the phone said it had started: done once it has. */
  pending: "stop" | "abort" | null;
  /** What was heard is dropped rather than sent: aborted, or the phone took the microphone. */
  dropped: boolean;
  heard: HeardSpeech;
}
