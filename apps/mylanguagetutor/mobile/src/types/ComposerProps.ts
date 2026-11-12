import type { VoiceInput } from "@mylanguagetutor/api-client/types/session/voice-input";
import type { RecognizerPrivacy } from "./RecognizerPrivacy";
import type { SpeechInputControls } from "./SpeechInputControls";
import type { TypedComposerProps } from "./TypedComposerProps";

export interface ComposerProps extends Omit<TypedComposerProps, "label"> {
  voice: VoiceInput;
  recognition: SpeechInputControls;
  /** Null until it's known where this phone turns speech into text. */
  privacy: RecognizerPrivacy | null;
}
