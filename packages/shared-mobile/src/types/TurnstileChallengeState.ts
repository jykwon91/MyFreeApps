import type { TurnstileChallengeProps } from "./TurnstileChallengeProps";

export interface TurnstileChallengeState {
  /** Empty until the check is done, and again once it's spent or expired. */
  token: string;
  /** Done, or not needed: an app with no site key sends no token. */
  isReady: boolean;
  /**
   * Asks for a fresh token. Call it after every failed submit: the server spends a token even when it then refuses
   * the request. `problem` shows under the check until it's done again.
   */
  reset: (problem?: string) => void;
  /** Shows `problem` under the check without starting it over, such as a submit before it was done. */
  showProblem: (problem: string) => void;
  /** Spread onto `<TurnstileChallenge />`. */
  challengeProps: TurnstileChallengeProps;
}
