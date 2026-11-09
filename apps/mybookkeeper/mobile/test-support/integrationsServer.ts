import type { EmailQueueItem } from "@mybookkeeper/api-client/types/integration/email-queue-item";
import type { Integration } from "@mybookkeeper/api-client/types/integration/integration";
import type { SyncLog } from "@mybookkeeper/api-client/types/integration/sync-log";
import api from "@platform/core/lib/api";
import type { AxiosAdapter } from "axios";
import { applyIntegrationsWrite } from "./applyIntegrationsWrite";
import type { FakeIntegrationsServer } from "./FakeIntegrationsServer";
import type { IntegrationsRoute } from "./IntegrationsRoute";

export function aGmail(overrides: Partial<Integration> = {}): Integration {
  return { provider: "gmail", connected: true, last_synced_at: null, needs_reauth: false, gmail_label: null, ...overrides };
}

export function aSyncLog(overrides: Partial<SyncLog> = {}): SyncLog {
  return {
    id: 1,
    status: "success",
    records_added: 3,
    error: null,
    started_at: "2026-11-01T12:00:00Z",
    completed_at: "2026-11-01T12:05:00Z",
    cancelled_at: null,
    total_items: 0,
    emails_total: 0,
    emails_done: 0,
    emails_fetched: 0,
    gmail_matches_total: 0,
    ...overrides,
  };
}

export function aQueueItem(overrides: Partial<EmailQueueItem> = {}): EmailQueueItem {
  return { id: "q1", sync_log_id: 1, attachment_filename: "invoice.pdf", email_subject: "Your invoice", status: "fetched", error: null, created_at: "2026-11-01T12:00:00Z", ...overrides };
}

/** The integration, sync history and email queue requests, answered in memory. */
export function startIntegrationsServer(overrides: Partial<FakeIntegrationsServer> = {}): FakeIntegrationsServer {
  const server: FakeIntegrationsServer = { integrations: [aGmail()], logs: [], queue: [], role: "owner", failures: {}, requests: [], documentReads: 0, ...overrides };
  const adapter: AxiosAdapter = (config) => {
    const respond = (data: unknown, status = 200) => {
      const response = { data: JSON.parse(JSON.stringify(data)), status, statusText: "", headers: {}, config };
      if (status < 400) return Promise.resolve(response);
      return Promise.reject(Object.assign(new Error(String(status)), { config, response, isAxiosError: true }));
    };
    const outcome = (route: IntegrationsRoute, data: unknown) => {
      const failure = server.failures[route];
      if (failure === "hold") return new Promise<never>(() => undefined);
      if (failure === "offline") return Promise.reject(Object.assign(new Error("Network Error"), { config }));
      return failure ? respond({ detail: failure.detail ?? "A developer's message" }, failure.status) : respond(data);
    };
    const url = config.url ?? "";
    const method = (config.method ?? "get").toLowerCase();
    if (url === "/organizations") return respond([{ id: "w1", name: "Mine", org_role: server.role }]);
    if (method === "get") {
      if (url === "/integrations") return outcome("integrations", server.integrations);
      if (url === "/integrations/gmail/logs") return outcome("logs", server.logs);
      if (url === "/integrations/gmail/queue") return outcome("queue", server.queue);
      if (url === "/documents") {
        server.documentReads += 1;
        return respond([]);
      }
      return respond({}, 404);
    }
    server.requests.push(config);
    if (server.failures.write) return outcome("write", {});
    return outcome("write", applyIntegrationsWrite(server, method, url, config.data));
  };
  api.defaults.adapter = adapter;
  return server;
}

/** The write requests made so far, as "METHOD url". */
export function writesMade(server: FakeIntegrationsServer): string[] {
  return server.requests.map((request) => `${(request.method ?? "get").toUpperCase()} ${request.url}`);
}
