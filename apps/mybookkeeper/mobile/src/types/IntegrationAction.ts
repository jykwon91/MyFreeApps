export interface IntegrationAction {
  isBusy: boolean;
  run: () => Promise<void>;
}
