import type { useGetEmailQueueQuery, useGetIntegrationsQuery, useGetSyncLogsQuery } from "@mybookkeeper/api-client/store/integrationsApi";
import type { Integration } from "@mybookkeeper/api-client/types/integration/integration";
import type { GmailConnection } from "./GmailConnection";

/** What the Integrations screen shows, with each request's own loading and error state. */
export interface IntegrationsData {
  integrations: ReturnType<typeof useGetIntegrationsQuery>;
  gmail: Integration | undefined;
  connection: GmailConnection;
  logs: ReturnType<typeof useGetSyncLogsQuery>;
  queue: ReturnType<typeof useGetEmailQueueQuery>;
  /** Re-reads everything that is showing. */
  refresh: () => Promise<void>;
}
