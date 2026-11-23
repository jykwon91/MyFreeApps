import type { FakeRecognizer } from "./FakeRecognizer";
import type { SpokenUtterance } from "./SpokenUtterance";

/** What the speech fakes leave on `window` for a spec to read back. */
export interface SpeechFakeWindow {
  __spoken: SpokenUtterance[];
  __recognitionStarts: number;
  /** The recogniser the app last started, for `hearSpeech` to feed. */
  __recognizer: FakeRecognizer | null;
}
