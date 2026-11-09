import type { EmailQueueItem } from "@mybookkeeper/api-client/types/integration/email-queue-item";
import type { Integration } from "@mybookkeeper/api-client/types/integration/integration";
import type { SyncLog } from "@mybookkeeper/api-client/types/integration/sync-log";
import type { AxiosRequestConfig } from "axios";
import type { IntegrationsFailure } from "./IntegrationsFailure";
import type { IntegrationsRoute } from "./IntegrationsRoute";

export interface FakeIntegrationsServer {
  integrations: Integration[];
  logs: SyncLog[];
  queue: EmailQueueItem[];
  role: string;
  /** Reads of a route fail until cleared; "write" fails every request that isn't a read. */
  failures: Partial<Record<IntegrationsRoute, IntegrationsFailure>>;
  requests: AxiosRequestConfig[];
  /** Every read of a document list, to see whether finished extraction made it reload. */
  documentReads: number;
}
