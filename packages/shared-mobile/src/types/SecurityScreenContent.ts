/** The Security screen's words that differ between apps, as each app's website says them. */
export interface SecurityScreenContent {
  /** The note recommending two-step sign-in. */
  intro: string;
  /** Finishes "A code from an authenticator app protects …", e.g. "your books". */
  whatTwoStepProtects: string;
  /** Where the display name shows. */
  displayNameDescription: string;
  /** What the data export holds. */
  exportDescription: string;
}
