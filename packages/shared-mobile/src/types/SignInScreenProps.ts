export interface SignInScreenProps {
  appName: string;
  /** Registration and password resets happen on the website. */
  webBaseUrl: string;
  onSignedIn: () => void;
}
