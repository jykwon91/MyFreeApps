/**
 * A fake server for the Transactions page tests: GET /transactions/page, /selection and
 * /categories answer from 120 rows ("Row n"), or from 2 pending ones ("Pending n") when a
 * status filter is set. Bulk Approve and an edit change what later requests match, as the
 * real server would, so tests can follow a mutation through the refetch.
 */
import { configureStore } from "@reduxjs/toolkit";
import { act, render } from "@testing-library/react";
import type { AxiosAdapter } from "axios";
import { Provider } from "react-redux";
import { MemoryRouter } from "react-router-dom";
import api from "@/shared/lib/api";
import { baseApi } from "@/shared/store/baseApi";
import type { Transaction } from "@mybookkeeper/api-client/types/transaction/transaction";
import type { TransactionListPage } from "@mybookkeeper/api-client/types/transaction/TransactionListPage";
import type { TransactionSelectionRef } from "@mybookkeeper/api-client/types/transaction/TransactionSelectionRef";
import Transactions from "@/app/pages/Transactions";
import { serverError } from "./server-error";

export const TOTAL = 120;
export const PENDING_TOTAL = 2;
const PENDING_PREFIX = "Pending";

function aTransaction(n: number, prefix: string): Transaction {
  return {
    id: `${prefix}-${n}`,
    organization_id: "org-1",
    user_id: "user-1",
    // Pending rows have a property, so bulk Approve applies to them.
    property_id: prefix === PENDING_PREFIX ? "prop-1" : null,
    extraction_id: null,
    vendor_id: null,
    transaction_date: "2025-03-01",
    tax_year: 2025,
    sub_category: null,
    usage_quantity: null,
    usage_unit: null,
    service_period_start: null,
    service_period_end: null,
    vendor: `${prefix} ${n}`,
    description: null,
    amount: "10.00",
    transaction_type: "expense",
    category: "repairs",
    tags: [],
    tax_relevant: true,
    schedule_e_line: null,
    is_capital_improvement: false,
    placed_in_service_date: null,
    channel: null,
    address: null,
    payment_method: null,
    status: "pending",
    review_fields: null,
    reconciled: false,
    reconciled_at: null,
    is_manual: false,
    deleted_at: null,
    created_at: "2025-03-01T00:00:00Z",
    updated_at: "2025-03-01T00:00:00Z",
    source_document_id: null,
    source_file_name: null,
    linked_document_ids: [],
    external_id: null,
    external_source: null,
    is_pending: false,
    activity_id: null,
    review_reason: null,
    applicant_id: null,
    attribution_source: null,
    payer_name: null,
  };
}

function range(count: number): number[] {
  return Array.from({ length: count }, (_, i) => i + 1);
}

interface ServerState {
  approved: Set<string>;
  recategorized: Map<string, string>;
  deleted: Set<string>;
  selectionResponse: (query: URLSearchParams) => Promise<TransactionSelectionRef[]>;
  /** GET /transactions/page; a rejection answers with a 500. */
  pageResponse: (query: URLSearchParams) => Promise<TransactionListPage>;
}

export const server: ServerState = {
  approved: new Set(),
  recategorized: new Map(),
  deleted: new Set(),
  selectionResponse: async (query) => selectionFor(query),
  pageResponse: async (query) => pageFor(query),
};

function matchingRows(query: URLSearchParams): Transaction[] {
  const pending = query.getAll("statuses").length > 0;
  const rows = pending ? range(PENDING_TOTAL).map((n) => aTransaction(n, PENDING_PREFIX)) : range(TOTAL).map((n) => aTransaction(n, "Row"));
  const categories = query.getAll("categories");
  return rows
    .map((row): Transaction => ({
      ...row,
      category: server.recategorized.get(row.id) ?? row.category,
      status: server.approved.has(row.id) ? "approved" : row.status,
    }))
    .filter((row) => !server.deleted.has(row.id))
    .filter((row) => !pending || row.status === "pending")
    .filter((row) => !categories.length || categories.includes(row.category));
}

function pageFor(query: URLSearchParams): TransactionListPage {
  const rows = matchingRows(query);
  const offset = Number(query.get("offset"));
  const items = rows.slice(offset, offset + Number(query.get("limit")));
  return { items, total: rows.length, has_more: offset + items.length < rows.length };
}

export function selectionFor(query: URLSearchParams): TransactionSelectionRef[] {
  return matchingRows(query).map(({ id, property_id, status }) => ({ id, property_id, status }));
}

function isIdsBody(body: unknown): body is { ids: string[] } {
  return typeof body === "object" && body !== null && "ids" in body && Array.isArray(body.ids);
}

function isKeepBody(body: unknown): body is { keep_id: string; delete_ids: string[] } {
  return typeof body === "object" && body !== null && "delete_ids" in body && Array.isArray(body.delete_ids);
}

function isCategoryBody(body: unknown): body is { category: string } {
  return typeof body === "object" && body !== null && "category" in body && typeof body.category === "string";
}

export const requests: { path: string; query: URLSearchParams; body: unknown }[] = [];
let store: ReturnType<typeof makeStore>;
const originalAdapter = api.defaults.adapter;

export const adapter: AxiosAdapter = async (config) => {
  const url = new URL(config.url ?? "", "http://test");
  const body: unknown = typeof config.data === "string" ? JSON.parse(config.data) : config.data;
  requests.push({ path: url.pathname, query: url.searchParams, body });
  let data: unknown = config.method === "get" ? [] : {};
  if (url.pathname === "/transactions/page") {
    try {
      data = await server.pageResponse(url.searchParams);
    } catch {
      throw serverError(config);
    }
  }
  if (url.pathname === "/transactions/selection") data = await server.selectionResponse(url.searchParams);
  if (url.pathname === "/transactions/categories") data = ["repairs", "utilities"];
  if (url.pathname === "/transactions/bulk-delete" && isIdsBody(body)) data = { deleted: body.ids.length, skipped: 0 };
  if (url.pathname === "/transactions/bulk-approve" && isIdsBody(body)) {
    for (const id of body.ids) server.approved.add(id);
    data = { approved: body.ids.length, skipped: 0 };
  }
  if (url.pathname === "/transactions/duplicates/keep" && isKeepBody(body)) {
    for (const id of body.delete_ids) server.deleted.add(id);
    data = { kept: 1, deleted: body.delete_ids.length };
  }
  const edited = config.method === "patch" ? url.pathname.replace("/transactions/", "") : null;
  if (edited && isCategoryBody(body)) {
    server.recategorized.set(edited, body.category);
    data = { transaction: { ...aTransaction(0, "Row"), id: edited, category: body.category } };
  }
  return { status: 200, data, statusText: "", headers: {}, config };
};

function makeStore() {
  return configureStore({
    reducer: { [baseApi.reducerPath]: baseApi.reducer },
    middleware: (getDefault) => getDefault().concat(baseApi.middleware),
  });
}

export function renderPage(): ReturnType<typeof makeStore> {
  store = makeStore();
  render(
    <Provider store={store}>
      <MemoryRouter>
        <Transactions />
      </MemoryRouter>
    </Provider>,
  );
  return store;
}

/** Call from beforeEach. */
export function resetServer(): void {
  requests.length = 0;
  server.approved.clear();
  server.recategorized.clear();
  server.deleted.clear();
  server.selectionResponse = async (query) => selectionFor(query);
  server.pageResponse = async (query) => pageFor(query);
  api.defaults.adapter = adapter;
}

/** Call from afterEach. */
export function stopServer(): void {
  act(() => {
    store.dispatch(baseApi.util.resetApiState());
  });
  api.defaults.adapter = originalAdapter;
}

export const callsTo = (path: string) => requests.filter((request) => request.path === path).map((request) => request.query);
export const bodiesTo = (path: string) => requests.filter((request) => request.path === path).map((request) => request.body);
export const lastPageQuery = () => {
  const calls = callsTo("/transactions/page");
  return calls[calls.length - 1] ?? new URLSearchParams();
};
export const bulkBar = (inside: HTMLElement) => inside.closest("div") ?? inside;
