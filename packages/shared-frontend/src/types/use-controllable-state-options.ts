export interface UseControllableStateOptions<T> {
  /** The controlled value. `undefined` means the hook owns the state. */
  value: T | undefined;
  /** Starting value while uncontrolled. */
  defaultValue: T;
  /** Notified with every resolved next value, controlled or not. */
  onChange?: (next: T) => void;
}
