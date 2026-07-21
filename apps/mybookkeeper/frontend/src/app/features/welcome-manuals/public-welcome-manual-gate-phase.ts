/**
 * Gate phases for the public welcome-manual guest page (before the manual
 * content is unlocked). Extracted to an `as const` map rather than an inline
 * string-literal union so the phase values live in one place instead of being
 * repeated as magic strings across comparisons.
 */
export const GATE_PHASE = {
  LOADING: "loading",
  LOCKED: "locked",
  NOT_ACTIVE: "not-active",
} as const;

export type GatePhase = (typeof GATE_PHASE)[keyof typeof GATE_PHASE];
