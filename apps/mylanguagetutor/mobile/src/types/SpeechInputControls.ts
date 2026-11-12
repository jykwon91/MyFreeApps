import type { SpeechRecognitionControls } from "@mylanguagetutor/api-client/types/speech/speech-recognition-controls";

export interface SpeechInputControls extends SpeechRecognitionControls {
  /** Stops listening and drops what was heard: the app went to the background, or the screen closed. */
  abort: () => void;
}
