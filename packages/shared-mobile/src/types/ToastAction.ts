/** A button on a toast, such as "Undo". Pressing it runs `onPress` and dismisses the toast. */
export interface ToastAction {
  label: string;
  onPress: () => void;
  /** What pressing it does, for screen readers. */
  accessibilityHint?: string;
}
