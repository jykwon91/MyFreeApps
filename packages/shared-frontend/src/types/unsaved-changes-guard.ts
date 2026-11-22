/** What `useUnsavedChangesGuard` gives a form. */
export interface UnsavedChangesGuard {
  /** True while the form asks whether to throw its changes away. */
  isAsking: boolean;
  /** Runs `leave` now if nothing would be lost, otherwise asks first and runs it on Discard. */
  requestLeave: (leave: () => void) => void;
  /** Runs `leave` without asking, for leaving after a save. Navigation it starts isn't blocked. */
  leaveWithoutAsking: (leave: () => void) => void;
  keepEditing: () => void;
  discard: () => void;
}
