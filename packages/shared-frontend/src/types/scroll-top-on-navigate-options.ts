export interface ScrollTopOnNavigateOptions {
  /**
   * Also scroll the window to the top on a new path. For a frame used in apps
   * whose window scrolls rather than the frame (MBK doesn't lock the body to
   * the viewport): there the frame grows with its page and never scrolls.
   */
  resetWindow?: boolean;
}
