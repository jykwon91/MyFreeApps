export interface LoginFormRegisterLinkProps {
  onSignIn: (email: string, password: string) => Promise<void>;
  registerHref: string;
  trustCopy: string;
  autoFocusEmail: boolean;
}
