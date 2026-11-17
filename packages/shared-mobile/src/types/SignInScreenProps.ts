import type { RegistrationMode } from "./RegistrationMode";

export interface SignInScreenProps {
  appName: string;
  /** Registration and password resets happen on the website. */
  webBaseUrl: string;
  /** Defaults to "open". Invite-only apps show a note instead of a link to a sign-up page they can't use. */
  registration?: RegistrationMode;
  onSignedIn?: () => void;
}
