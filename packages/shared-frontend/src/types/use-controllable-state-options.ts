/**
 * Options for useControllableState.
 *
 * Switching modes mid-life:
 * - controlled → uncontrolled (`value` goes from defined to `undefined`): the hook
 *   keeps the last controlled value as its own state and carries on from there,
 *   so the UI doesn't jump back to `defaultValue`.
 * - uncontrolled → controlled: `value` takes over; the hook's own state is ignored
 *   while `value` is defined.
 */
export interface UseControllableStateOptions<T> {
  /** The controlled value. `undefined` means the hook owns the state. */
  value: T | undefined;
  /** Starting value while uncontrolled. Read on the first render only. */
  defaultValue: T;
  /**
   * Notified with every resolved next value, controlled or not. Not called when
   * the next value is the current one (`Object.is`).
   */
  onChange?: (next: T) => void;
}
