import api from "@platform/core/lib/api";
import type { Property } from "@mybookkeeper/api-client/types/property/property";
import type { SummaryResponse } from "@mybookkeeper/api-client/types/summary/summary";
import type { Transaction } from "@mybookkeeper/api-client/types/transaction/transaction";
import type { AxiosAdapter, AxiosRequestConfig } from "axios";

export function aTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: "t1",
    property_id: "p1",
    transaction_date: "2026-03-14",
    vendor: "Home Depot",
    description: "Lumber",
    amount: "84.20",
    transaction_type: "expense",
    category: "maintenance",
    status: "approved",
    address: null,
    review_reason: null,
    source_document_id: null,
    source_file_name: null,
    ...overrides,
  } as Transaction;
}

export function aProperty(overrides: Partial<Property> = {}): Property {
  return { id: "p1", name: "Oak Street", address: null, is_active: true, ...overrides } as Property;
}

export interface FakeTransactionServer {
  transactions: Transaction[];
  properties: Property[];
  role: string;
  offline: boolean;
  /** The status every transaction write fails with, while set. */
  failWritesWith: number | null;
  /** Fails list requests at or past this offset, while set. */
  failListFromOffset: number | null;
  retroactiveCount: number;
  summary: Partial<SummaryResponse>;
  summaryYears: number[];
  documents: { id: string; status: string }[];
  /** Fails summary requests while set. */
  failSummary: boolean;
  requests: AxiosRequestConfig[];
}

const REVIEWABLE = ["pending", "needs_review", "unverified"];

/** Answers the app's own requests, so a screen test runs through the real API client. */
export function startTransactionServer(transactions: Transaction[], properties: Property[] = [aProperty()]): FakeTransactionServer {
  const server: FakeTransactionServer = {
    transactions,
    properties,
    role: "owner",
    offline: false,
    failWritesWith: null,
    failListFromOffset: null,
    retroactiveCount: 0,
    summary: { revenue: 0, expenses: 0, profit: 0, by_property: [] },
    summaryYears: [2026],
    documents: [],
    failSummary: false,
    requests: [],
  };
  const adapter: AxiosAdapter = (config) => {
    const respond = (data: unknown, status = 200) => {
      const response = { data, status, statusText: "", headers: {}, config };
      if (status < 400) return Promise.resolve(response);
      return Promise.reject(Object.assign(new Error(String(status)), { config, response, isAxiosError: true }));
    };
    if (config.url === "/organizations") return respond([{ id: "w1", name: "Mine", org_role: server.role }]);
    server.requests.push(config);
    if (server.offline) return Promise.reject(Object.assign(new Error("Network Error"), { config }));
    if (config.url === "/properties") return respond(server.properties);
    if (config.url === "/documents") return respond(server.documents);
    if (config.url === "/summary/years") return respond(server.summaryYears);
    if (config.url?.startsWith("/summary")) return server.failSummary ? respond({ detail: "nope" }, 500) : respond(server.summary);
    if (config.url === "/transactions/review-count") {
      return respond({ count: server.transactions.filter((row) => REVIEWABLE.includes(row.status)).length });
    }
    if (config.url === "/transactions") {
      const params = (config.params ?? {}) as Record<string, string | number | boolean | undefined>;
      const offset = Number(params.offset ?? 0);
      if (server.failListFromOffset !== null && offset >= server.failListFromOffset) return respond({ detail: "nope" }, 500);
      const matches = server.transactions.filter(
        (row) =>
          (!params.to_review || REVIEWABLE.includes(row.status)) &&
          (!params.status || row.status === params.status) &&
          (!params.vendor || (row.vendor ?? "").toLowerCase().includes(String(params.vendor).toLowerCase())),
      );
      return respond(matches.slice(offset, offset + Number(params.limit ?? 1000)));
    }
    const id = config.url?.split("/")[2];
    const index = server.transactions.findIndex((row) => row.id === id);
    if (config.method !== "get" && server.failWritesWith !== null) return respond({ detail: "nope" }, server.failWritesWith);
    if (index === -1) return respond({ detail: "Transaction not found" }, 404);
    if (config.method === "delete") {
      server.transactions.splice(index, 1);
      return respond(null, 204);
    }
    if (config.method === "patch") {
      const changes = JSON.parse(String(config.data)) as Partial<Transaction>;
      server.transactions[index] = { ...server.transactions[index], ...changes } as Transaction;
      return respond({ ...server.transactions[index], retroactive_count: server.retroactiveCount });
    }
    return respond(server.transactions[index]);
  };
  api.defaults.adapter = adapter;
  return server;
}

export const lastPatch = (server: FakeTransactionServer): Partial<Transaction> => {
  const patch = server.requests.filter((request) => request.method === "patch").at(-1);
  return JSON.parse(String(patch?.data)) as Partial<Transaction>;
};
