/**
 * A button on a toast, such as "Undo". The phone apps have their own equivalent.
 *
 * Clicking it runs `onClick` and keeps the toast open, with the button disabled,
 * until the returned promise settles; then the toast closes, whether it resolved
 * or rejected. `onClick` owns its error UI: catch its failures and show them (an
 * error toast, say). A rejection that escapes is only logged to the console.
 */
export interface ToastAction {
  label: string;
  /** Shown on the button while `onClick` runs; defaults to `label`. */
  pendingLabel?: string;
  /**
   * Required by Radix: tells screen-reader users how to do the same thing
   * without the toast, since it may close before they reach it.
   */
  altText: string;
  onClick: () => void | Promise<void>;
}
