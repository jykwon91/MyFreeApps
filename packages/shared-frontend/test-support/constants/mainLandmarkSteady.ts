/**
 * How long a wrong main-landmark count (none, or two) must hold before the
 * crash guard reports it instead of counting on to MAIN_LANDMARK_SETTLE_TIMEOUT_MS.
 * A page swapping a skeleton or a lazy route changes its count well within
 * this; one that keeps the same wrong count this long has settled on it.
 */
export const MAIN_LANDMARK_STEADY_MS = 500;
