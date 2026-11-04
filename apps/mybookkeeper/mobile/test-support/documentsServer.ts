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
  requests: AxiosRequestConfig[];
}

/** Answers the app's own requests, so a screen test runs through the real API client. */
export function startFakeServer(documents: Document[], role = "owner"): FakeServer {
  const server: FakeServer = { documents, role, offline: false, requests: [] };
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
    const id = config.url?.split("/")[2];
    const found = server.documents.find((document) => document.id === id);
    if (!found) return respond({ detail: "Not found" }, 404);
    if (config.method === "delete") {
      server.documents = server.documents.filter((document) => document.id !== id);
      return respond(null);
    }
    if (config.method === "post") return respond({ status: "processing" });
    return respond(found);
  };
  api.defaults.adapter = adapter;
  return server;
}
