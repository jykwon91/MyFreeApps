import type { ComposerView } from "./composer-view";
import type { InputMode } from "./input-mode";
import type { VoicePhase } from "./voice-phase";

export interface VoiceInput {
  mode: InputMode;
  phase: VoicePhase;
  view: ComposerView;
  /** Opens the microphone, stopping the tutor's voice first. Does nothing while a turn is in flight or blocked. */
  startListening: () => void;
  /** The learner read the privacy notice: keep that, and start listening. */
  acceptPrivacy: () => void;
  /** Stops listening (delivering what was heard) and shows the typed answer. */
  switchToText: () => void;
  switchToVoice: () => void;
}
