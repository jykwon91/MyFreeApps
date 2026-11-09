import type { IntegrationAction } from "./IntegrationAction";
import type { IntegrationCancelAction } from "./IntegrationCancelAction";

export interface IntegrationActions {
  sync: IntegrationAction;
  cancel: IntegrationCancelAction;
  disconnect: IntegrationAction;
  extractAll: IntegrationAction;
  retryAll: IntegrationAction;
}
