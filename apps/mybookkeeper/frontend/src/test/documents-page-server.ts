/**
 * A fake server for the Documents page tests: GET /documents/page and /documents/selection answer from
 * TOTAL documents ("doc-1.pdf" newest), every FAILED_EVERY-th of them failed, narrowed by status and
 * search the way the backend narrows them. Bulk delete removes what it's given, so later requests
 * follow it, and every request is recorded.
 */
import type { AxiosAdapter } from "axios";
import api from "@/shared/lib/api";
import type { Document } from "@mybookkeeper/api-client/types/document/document";
import type { DocumentListPage } from "@mybookkeeper/api-client/types/document/DocumentListPage";
import type { DocumentSelectionRef } from "@mybookkeeper/api-client/types/document/DocumentSelectionRef";

export const TOTAL = 120;
export const FAILED_EVERY = 10;

function aDocument(n: number): Document {
  return {
    id: `doc-${n}`,
    user_id: "user-1",
    property_id: null,
    created_at: new Date(Date.UTC(2026, 0, 1) - n * 60_000).toISOString(),
    updated_at: "2026-01-01T00:00:00Z",
    file_name: `doc-${n}.pdf`,
    file_type: "pdf",
    document_type: "invoice",
    file_mime_type: "application/pdf",
    email_message_id: null,
    external_id: null,
    external_source: null,
    source: "upload",
    status: n % FAILED_EVERY === 0 ? "failed" : "completed",
    error_message: null,
    batch_id: null,
    is_escrow_paid: false,
    deleted_at: null,
  };
}

const deleted = new Set<string>();
export const requests: { path: string; query: URLSearchParams; body: unknown }[] = [];

function matching(query: URLSearchParams): Document[] {
  const statuses = query.getAll("statuses");
  const search = (query.get("search") ?? "").toLowerCase();
  return Array.from({ length: TOTAL }, (_, i) => aDocument(i + 1))
    .filter((document) => !deleted.has(document.id))
    .filter((document) => !statuses.length || statuses.includes(document.status))
    .filter((document) => (document.file_name ?? "").toLowerCase().includes(search));
}

function pageFor(query: URLSearchParams): DocumentListPage {
  const rows = matching(query);
  const offset = Number(query.get("offset"));
  const items = rows.slice(offset, offset + Number(query.get("limit")));
  return { items, total: rows.length, has_more: offset + items.length < rows.length };
}

function selectionFor(query: URLSearchParams): DocumentSelectionRef[] {
  return matching(query).map(({ id, status }) => ({ id, status }));
}

function isIdsBody(body: unknown): body is { ids: string[] } {
  return typeof body === "object" && body !== null && "ids" in body && Array.isArray(body.ids);
}

const adapter: AxiosAdapter = async (config) => {
  const url = new URL(config.url ?? "", "http://test");
  const body: unknown = typeof config.data === "string" ? JSON.parse(config.data) : config.data;
  requests.push({ path: url.pathname, query: url.searchParams, body });
  let data: unknown = config.method === "get" ? [] : {};
  if (url.pathname === "/documents/page") data = pageFor(url.searchParams);
  if (url.pathname === "/documents/selection") data = selectionFor(url.searchParams);
  if (url.pathname === "/documents/bulk-delete" && isIdsBody(body)) {
    for (const id of body.ids) deleted.add(id);
    data = { deleted: body.ids, skipped: [] };
  }
  return { status: 200, data, statusText: "", headers: {}, config };
};

const originalAdapter = api.defaults.adapter;

export function startDocumentsServer(): void {
  deleted.clear();
  requests.length = 0;
  api.defaults.adapter = adapter;
}

export function stopDocumentsServer(): void {
  api.defaults.adapter = originalAdapter;
}
