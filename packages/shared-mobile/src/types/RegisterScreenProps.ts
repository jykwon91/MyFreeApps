import type { RegisterNameField } from "./RegisterNameField";

export interface RegisterScreenProps {
  appName: string;
  /** The app's website. The captcha loads as one of its pages. */
  webBaseUrl: string;
  /** The app's public Turnstile site key; empty turns the check off, as in development and tests. */
  turnstileSiteKey: string;
  /** Which key the name goes under in the sign-up request. Defaults to "display_name". */
  nameField?: RegisterNameField;
  /** "Already have an account?" and, after signing up, "Back to sign in". */
  onSignIn: () => void;
}
