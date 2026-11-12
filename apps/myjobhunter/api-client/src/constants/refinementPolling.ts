/**
 * How often an open refinement session is fetched again. The same poll drives the preparing
 * progress and the unlock, and carries on after completion: the data is stable then, so the cost is
 * one small GET, and stopping it would leave a stale cache for a later download.
 */
export const REFINEMENT_POLL_INTERVAL_MS = 3000;
