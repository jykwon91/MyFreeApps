/**
 * How long the crash guard keeps re-counting a page's main landmarks before
 * it reports the count. A test can end while the page is still swapping a
 * skeleton or a lazy route for the loaded page; a settled page answers on the
 * first count, so only a page that really has no main (or two) waits this long.
 */
export const MAIN_LANDMARK_SETTLE_TIMEOUT_MS = 3_000;
