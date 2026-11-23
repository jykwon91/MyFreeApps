import type { SpeechQueueControls } from "@mylanguagetutor/api-client/types/speech/speech-queue-controls";

export interface SpeechSynthesisControls extends SpeechQueueControls {
  supported: boolean;
}
