/** A single-use Cloudflare Turnstile token and the controls around it (`hooks/useTurnstileToken.ts`). */
export interface TurnstileTokenState {
  /** False when the bundle has no site key (local dev): the backend skips the check. */
  needsToken: boolean;
  token: string;
  /** Changes on every reset — the `TurnstileField`'s widget remounts and fetches a fresh token. */
  resetKey: number;
  /** The last token expired before it was used. */
  expired: boolean;
  onVerify: (token: string) => void;
  onExpire: () => void;
  /** Throw the current token away and get a new one. Call after every request that reached the server. */
  reset: () => void;
}
