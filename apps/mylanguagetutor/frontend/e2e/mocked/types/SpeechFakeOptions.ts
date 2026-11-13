export interface SpeechFakeOptions {
  /**
   * Whether the browser can recognise speech. False is Firefox: typed practice only.
   * True installs a recogniser that is never fed audio (no microphone in these specs).
   */
  recognition: boolean;
}
