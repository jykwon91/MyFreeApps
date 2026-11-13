/** A score change smaller than this (in %) reads "About the same", not an upgrade or downgrade. */
export const SAME_SCORE_PCT = 2;

/** A score change above this (in %) shows as "+100%+" rather than a huge number. */
export const MAX_SHOWN_PCT = 100;

/** A downgrade never shows below this (in %): losing more than the worn item scored is still "all of it". */
export const MIN_SHOWN_PCT = -100;

/** Score differences smaller than this are rounding, not a change. */
export const SCORE_EPSILON = 0.01;
