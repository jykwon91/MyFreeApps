export interface ForgotPasswordScreenProps {
  appName: string;
  /** The app's website. The captcha loads as one of its pages, and the emailed link opens there. */
  webBaseUrl: string;
  /** The app's public Turnstile site key; empty turns the check off, as in development and tests. */
  turnstileSiteKey: string;
  /** "Back to sign in", before and after sending the link. */
  onSignIn: () => void;
}
