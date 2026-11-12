import type { RecognitionFailure } from "@mylanguagetutor/api-client/types/speech/recognition-failure";
import type { VoicePhase } from "@mylanguagetutor/api-client/types/session/voice-phase";

export interface VoiceComposerProps {
  phase: VoicePhase;
  /** The words heard so far in this answer. */
  interim: string;
  failure: RecognitionFailure | null;
  micDisabled: boolean;
  onStart: () => void;
  onStop: () => void;
  onTypeInstead: () => void;
}
