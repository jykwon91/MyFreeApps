/** What a caller of notifyAuthChange() knows about why the token changed. */
export interface AuthChangeOptions {
  /** The person signed out on purpose, as opposed to a session the server ended or that expired. */
  signedOut?: boolean;
}
