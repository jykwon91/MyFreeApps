import type { Ref } from "react";
import type { TurnstileChallengeHandle } from "./TurnstileChallengeHandle";

export interface TurnstileChallengeProps {
  /** The app's public Turnstile site key. Empty turns the check off, as in development and tests: nothing renders. */
  siteKey: string;
  /**
   * The app's website, which the check's page is loaded as, so Cloudflare sees a hostname the site key allows.
   * Only this page and challenges.cloudflare.com load inside the check; any other link opens in the browser.
   */
  baseUrl: string;
  onToken: (token: string) => void;
  /** The token is gone (expired, timed out, or the check failed), so a submit now would be refused. */
  onExpire: () => void;
  /** Why the last submit didn't get past the check, shown under it until it's done again. */
  error?: string;
  /** Exposes `reset()`. `useTurnstileChallenge` wires this for you. */
  ref?: Ref<TurnstileChallengeHandle>;
}
