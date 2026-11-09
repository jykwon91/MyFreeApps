export interface IntegrationCancelAction {
  isBusy: boolean;
  /** Cancels that sync, or the latest running one when no id is given. */
  run: (syncLogId?: number) => Promise<void>;
}
