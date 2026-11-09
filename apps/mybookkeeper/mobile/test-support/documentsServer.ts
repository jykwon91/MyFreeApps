import api from "@platform/core/lib/api";
import type { Document } from "@mybookkeeper/api-client/types/document/document";
import type { AxiosAdapter, AxiosRequestConfig } from "axios";

export function aDocument(overrides: Partial<Document> = {}): Document {
  return {
    id: "d1",
    file_name: "lumber.pdf",
    file_mime_type: "application/pdf",
    document_type: "receipt",
    source: "upload",
    status: "completed",
    error_message: null,
    created_at: "2026-11-01T00:00:00Z",
    ...overrides,
  } as Document;
}

export interface FakeServer {
  documents: Document[];
  role: string;
  /** Fails every documents request while set. */
  offline: boolean;
  /** Fails every write with this status while set. */
  failWritesWith: number | null;
  /** Ids a bulk delete leaves alone, as the server does for ones no longer in the workspace. */
  bulkDeleteSkips: string[];
  /** Ids a bulk delete refuses as being read. */
  bulkDeleteBeingRead: string[];
  /** Fails the nth bulk-delete request (1-based) and every one after it with a 500, while set. */
  failBulkDeleteFrom: number | null;
  /** How many transactions marking a document reference-only reports removing. */
  transactionsRemoved: number;
  requests: AxiosRequestConfig[];
}

/** Answers the app's own requests, so a screen test runs through the real API client. */
export function startFakeServer(documents: Document[], role = "owner"): FakeServer {
  const server: FakeServer = { documents, role, offline: false, failWritesWith: null, bulkDeleteSkips: [], bulkDeleteBeingRead: [], failBulkDeleteFrom: null, transactionsRemoved: 0, requests: [] };
  const adapter: AxiosAdapter = (config) => {
    const respond = (data: unknown, status = 200) => {
      const response = { data, status, statusText: "", headers: {}, config };
      if (status < 400) return Promise.resolve(response);
      return Promise.reject(Object.assign(new Error(String(status)), { config, response, isAxiosError: true }));
    };
    if (config.url === "/organizations") return respond([{ id: "w1", name: "Mine", org_role: server.role }]);
    server.requests.push(config);
    if (server.offline) return Promise.reject(Object.assign(new Error("Network Error"), { config }));
    if (config.url === "/documents") return respond(server.documents);
    if (config.method !== "get" && server.failWritesWith !== null) return respond({ detail: "nope" }, server.failWritesWith);
    if (config.url === "/documents/bulk-delete") {
      const attempt = server.requests.filter((request) => request.url === "/documents/bulk-delete").length;
      if (server.failBulkDeleteFrom !== null && attempt >= server.failBulkDeleteFrom) return respond({ detail: "nope" }, 500);
      const asked = (JSON.parse(String(config.data)) as { ids: string[] }).ids;
      const busy = asked.filter((id) => server.bulkDeleteBeingRead.includes(id));
      const gone = asked.filter((id) => !busy.includes(id) && !server.bulkDeleteSkips.includes(id) && server.documents.some((document) => document.id === id));
      server.documents = server.documents.filter((document) => !gone.includes(document.id));
      const missing = asked.filter((id) => !busy.includes(id) && !gone.includes(id));
      return respond({
        deleted: gone,
        skipped: [...busy.map((id) => ({ id, reason: "being_read" })), ...missing.map((id) => ({ id, reason: "not_found" }))],
      });
    }
    const id = config.url?.split("/")[2];
    const found = server.documents.find((document) => document.id === id);
    if (!found) return respond({ detail: "Not found" }, 404);
    if (config.method === "delete") {
      server.documents = server.documents.filter((document) => document.id !== id);
      return respond(null);
    }
    if (config.method === "patch") {
      const is_escrow_paid = (JSON.parse(String(config.data)) as { is_escrow_paid: boolean }).is_escrow_paid;
      server.documents = server.documents.map((document) => (document.id === id ? { ...document, is_escrow_paid } : document));
      return respond({ is_escrow_paid, transactions_removed: is_escrow_paid ? server.transactionsRemoved : 0 });
    }
    if (config.method === "post") return respond({ status: "processing" });
    return respond(found);
  };
  api.defaults.adapter = adapter;
  return server;
}
