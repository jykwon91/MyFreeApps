export interface LoginFormSignInOnlyProps {
  onSignIn: (email: string, password: string) => Promise<void>;
  trustCopy: string;
  autoFocusEmail: boolean;
}
