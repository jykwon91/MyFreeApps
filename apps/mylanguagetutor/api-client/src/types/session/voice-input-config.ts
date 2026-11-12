import type { SpeechRecognitionControls } from "../speech/speech-recognition-controls";
import type { RequestPhase } from "./request-phase";
import type { SessionBlock } from "./session-block";

export interface VoiceInputConfig {
  recognition: SpeechRecognitionControls;
  /** The tutor's voice is reading a reply aloud. */
  speaking: boolean;
  /** Stops the tutor's voice: talking over the tutor interrupts it. */
  stopSpeaking: () => void;
  requestPhase: RequestPhase;
  block: SessionBlock | null;
  /** The learner has read the privacy notice. Each app keeps that in its own storage. */
  privacyAcked: boolean;
  /** Keeps that the learner has read it. */
  ackPrivacy: () => void;
}
