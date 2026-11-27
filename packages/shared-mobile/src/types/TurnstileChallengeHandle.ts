export interface TurnstileChallengeHandle {
  /** Starts a fresh check, since each token works once. */
  reset: () => void;
}
