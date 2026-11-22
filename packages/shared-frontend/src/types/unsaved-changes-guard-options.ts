export interface UnsavedChangesGuardOptions {
  /**
   * While true (a save in flight), in-app navigation doesn't happen and nothing is asked:
   * the save is about to decide where the form goes.
   */
  isBusy?: boolean;
}
