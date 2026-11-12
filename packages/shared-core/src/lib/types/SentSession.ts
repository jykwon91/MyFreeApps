/** The sign-in a request went out with, captured when it was sent. */
export interface SentSession {
  token: string | null;
  /** Whose request it was, on a platform with `currentAccount`. */
  account?: string | null;
}
