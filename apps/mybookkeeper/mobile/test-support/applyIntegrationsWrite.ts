import type { SyncLog } from "@mybookkeeper/api-client/types/integration/sync-log";
import type { FakeIntegrationsServer } from "./FakeIntegrationsServer";

const WRITE_TIME = "2026-11-02T09:00:00Z";

function bodyOf(data: unknown): Record<string, unknown> {
  if (typeof data !== "string") return {};
  try {
    return JSON.parse(data) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** What the real server does to its data for a write, so the screens can be seen reloading it. Returns the answer. */
export function applyIntegrationsWrite(server: FakeIntegrationsServer, method: string, url: string, data: unknown): unknown {
  const queueItem = /^\/integrations\/gmail\/queue\/([^/]+)(\/retry)?$/.exec(url);
  if (method === "post" && url === "/integrations/gmail/sync") {
    const next: SyncLog = {
      id: Math.max(0, ...server.logs.map((log) => log.id)) + 1,
      status: "running",
      records_added: 0,
      error: null,
      started_at: WRITE_TIME,
      completed_at: null,
      cancelled_at: null,
      total_items: 0,
      emails_total: 0,
      emails_done: 0,
      emails_fetched: 0,
      gmail_matches_total: 0,
    };
    server.logs = [next, ...server.logs];
  } else if (method === "post" && url === "/integrations/gmail/sync/cancel") {
    const wanted = bodyOf(data).sync_log_id;
    server.logs = server.logs.map((log) =>
      log.status === "running" && (wanted === undefined || wanted === log.id) ? { ...log, status: "cancelled", cancelled_at: WRITE_TIME, completed_at: WRITE_TIME } : log,
    );
  } else if (method === "delete" && url === "/integrations/gmail") {
    server.integrations = server.integrations.filter((integration) => integration.provider !== "gmail");
  } else if (method === "post" && url === "/integrations/gmail/extract") {
    const count = server.queue.filter((item) => item.status === "fetched").length;
    server.queue = server.queue.map((item) => (item.status === "fetched" ? { ...item, status: "extracting" } : item));
    return { count };
  } else if (method === "post" && url === "/integrations/gmail/queue/retry-all") {
    server.queue = server.queue.map((item) => (item.status === "failed" ? { ...item, status: "fetched", error: null } : item));
  } else if (queueItem && method === "delete") {
    server.queue = server.queue.filter((item) => item.id !== queueItem[1]);
  } else if (queueItem && method === "post") {
    server.queue = server.queue.map((item) => (item.id === queueItem[1] ? { ...item, status: "fetched", error: null } : item));
  } else if (method === "patch" && url === "/integrations/gmail/label") {
    const label = String(bodyOf(data).label ?? "");
    server.integrations = server.integrations.map((integration) => (integration.provider === "gmail" ? { ...integration, gmail_label: label || null } : integration));
  }
  return {};
}
