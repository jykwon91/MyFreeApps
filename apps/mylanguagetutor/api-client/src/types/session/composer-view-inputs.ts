import type { RecognitionFailure } from "../speech/recognition-failure";
import type { InputMode } from "./input-mode";

export interface ComposerViewInputs {
  blocked: boolean;
  mode: InputMode;
  failure: RecognitionFailure | null;
  privacyAcked: boolean;
}
