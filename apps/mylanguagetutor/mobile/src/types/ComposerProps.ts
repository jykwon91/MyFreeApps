import type { VoiceInput } from "@mylanguagetutor/api-client/types/session/voice-input";
import type { SpeechRecognitionControls } from "@mylanguagetutor/api-client/types/speech/speech-recognition-controls";
import type { RecognizerPrivacy } from "./RecognizerPrivacy";
import type { TypedComposerProps } from "./TypedComposerProps";

export interface ComposerProps extends Omit<TypedComposerProps, "label"> {
  voice: VoiceInput;
  recognition: SpeechRecognitionControls;
  /** Null until it's known where this phone turns speech into text. */
  privacy: RecognizerPrivacy | null;
}
