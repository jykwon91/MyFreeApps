/** A response a spec holds back until it chooses, to see the page while it waits. */
export interface Gate {
  /** Settles once release() is called; a route handler awaits it before fulfilling. */
  wait: Promise<void>;
  /** Lets every waiting handler answer. Safe to call more than once (call it in `finally`). */
  release: () => void;
}
