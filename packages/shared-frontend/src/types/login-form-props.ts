import type { LoginFormLinkRegistration } from "./login-form-link-registration";
import type { LoginFormTabRegistration } from "./login-form-tab-registration";

interface LoginFormBaseProps {
  onSignIn: (email: string, password: string) => Promise<void>;
  onGoogleSignIn?: () => void;
  trustCopy?: string;
  /** Puts the cursor in the email field when the form appears. Off by default. */
  autoFocusEmail?: boolean;
}

/** Exactly one way to sign up: a Create Account tab (`onRegister`) or a link to the app's page (`registerHref`). */
export type LoginFormProps = LoginFormBaseProps & (LoginFormTabRegistration | LoginFormLinkRegistration);
