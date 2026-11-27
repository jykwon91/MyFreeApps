import type { RegistrationMode } from "./RegistrationMode";

export interface SignInScreenProps {
  appName: string;
  /** The app's website, where the links go for anything the app doesn't do itself. */
  webBaseUrl: string;
  /** Defaults to "open". Invite-only apps show a note instead of a link to a sign-up page they can't use. */
  registration?: RegistrationMode;
  onSignedIn?: () => void;
  /** Opens the app's own forgot-password screen. Without it, "Forgot your password?" links to the website. */
  onForgotPassword?: () => void;
  /**
   * Opens the app's own sign-up screen, for an "open" app. Without it, "New here?" links to the website.
   * An invite-only app shows its note either way.
   */
  onCreateAccount?: () => void;
}
