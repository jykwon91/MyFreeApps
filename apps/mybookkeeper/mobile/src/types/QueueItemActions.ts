import type { IntegrationAction } from "./IntegrationAction";

export interface QueueItemActions {
  retry: IntegrationAction;
  dismiss: IntegrationAction;
}
