import type { SpokenUtterance } from "./SpokenUtterance";

/** What the speech fakes leave on `window` for a spec to read back. */
export interface SpeechFakeWindow {
  __spoken: SpokenUtterance[];
  __recognitionStarts: number;
}
