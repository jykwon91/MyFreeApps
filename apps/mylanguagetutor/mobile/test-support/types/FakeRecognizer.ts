/** The phone's speech recognizer, as a test sets it up. */
export interface FakeRecognizer {
  /** The phone has a speech recognition service at all. */
  available: boolean;
  /** Android's on-device recognizer exists (Android 12 and later, with Google's speech services). */
  onDevice: boolean;
  /** The languages the on-device recognizer has installed, as the phone writes them. */
  installedLocales: string[];
  /** How the learner answers the permission prompt, or how it was answered before. */
  permission: "granted" | "denied";
  /**
   * The phone takes a while to start recording, until `beginRecording`, as iOS can: a stop or abort
   * sent meanwhile ends at once, overtaking the start, and recording still begins afterwards.
   */
  startsLate: boolean;
  /** The phone carries out an abort only at `finishAborting`, as iOS's own task can lag. */
  abortsLate: boolean;
}
