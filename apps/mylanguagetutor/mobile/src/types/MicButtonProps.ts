import type { VoicePhase } from "@mylanguagetutor/api-client/types/session/voice-phase";

export interface MicButtonProps {
  phase: VoicePhase;
  /** A turn is in flight: the button stays visible but can't be pressed. */
  disabled: boolean;
  onStart: () => void;
  onStop: () => void;
}
