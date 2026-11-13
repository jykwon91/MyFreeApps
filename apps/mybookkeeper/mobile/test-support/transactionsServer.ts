import { MAX_BULK_TRANSACTION_IDS } from "@mybookkeeper/api-client/constants/transactionBulk";
import api from "@platform/core/lib/api";
import type { InsurancePremiumComparison } from "@mybookkeeper/api-client/types/insurance/insurance-premium-comparison";
import type { Property } from "@mybookkeeper/api-client/types/property/property";
import type { SummaryResponse } from "@mybookkeeper/api-client/types/summary/summary";
import type { DuplicatePair } from "@mybookkeeper/api-client/types/transaction/DuplicatePair";
import type { ImportResult } from "@mybookkeeper/api-client/types/transaction/ImportResult";
import type { Transaction } from "@mybookkeeper/api-client/types/transaction/transaction";
import type { UtilityPlanRateComparison } from "@mybookkeeper/api-client/types/utility/utility-plan-rate-comparison";
import type { UtilityPlanRenewalAlert } from "@mybookkeeper/api-client/types/utility/utility-plan-renewal-alert";
import type { VendorSummary } from "@mybookkeeper/api-client/types/vendor/vendor-summary";
import type { AxiosAdapter, AxiosRequestConfig } from "axios";

export function aTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: "t1",
    property_id: "p1",
    transaction_date: "2026-03-14",
    tax_year: 2026,
    vendor: "Home Depot",
    vendor_id: null,
    description: "Lumber",
    amount: "84.20",
    transaction_type: "expense",
    category: "maintenance",
    status: "approved",
    channel: null,
    payment_method: null,
    tax_relevant: false,
    schedule_e_line: null,
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

export function aSavedVendor(overrides: Partial<VendorSummary> = {}): VendorSummary {
  return { id: "v1", name: "Ace Plumbing", category: "plumber", phone: null, hourly_rate: null, preferred: false, ...overrides } as VendorSummary;
}

export interface FakeTransactionServer {
  transactions: Transaction[];
  properties: Property[];
  /** The saved vendors a transaction can be linked to. */
  vendors: VendorSummary[];
  role: string;
  offline: boolean;
  /** The status every transaction write fails with, while set. */
  failWritesWith: number | null;
  /** Lets this many bulk-delete requests through, then fails the rest with a 500, while set. */
  bulkDeletesBeforeFailing: number | null;
  /** Lets this many bulk-approve requests through, then fails the rest with a 500, while set. */
  bulkApprovesBeforeFailing: number | null;
  /** Fails list requests at or past this offset, while set. */
  failListFromOffset: number | null;
  retroactiveCount: number;
  summary: Partial<SummaryResponse>;
  summaryYears: number[];
  documents: { id: string; status: string }[];
  /** Rent receipts waiting to send. Only the count is served. */
  pendingReceipts: number;
  pendingPayments: number;
  /** Fails summary requests while set. */
  failSummary: boolean;
  renewalAlerts: UtilityPlanRenewalAlert;
  rateComparison: UtilityPlanRateComparison;
  premiumComparison: InsurancePremiumComparison;
  /** What the duplicates list serves. Resolving one takes it off. */
  duplicates: DuplicatePair[];
  /** What a bank statement import answers with. Its preview rows land in the list, approved, as the backend saves them. */
  bankImportResult: ImportResult;
  /** Fails bank statement imports while set: with a status, or with no answer at all. */
  bankImportFailure: { status: number } | "offline" | null;
  requests: AxiosRequestConfig[];
}

const REVIEWABLE = ["pending", "needs_review", "unverified"];

/** What a real summary always carries, so a test only spells out what it's about. */
const EMPTY_SUMMARY: SummaryResponse = {
  revenue: 0,
  expenses: 0,
  profit: 0,
  by_category: {},
  by_property: [],
  by_month: [],
  by_month_expense: [],
  by_month_revenue: [],
  by_property_month: [],
};

export function noRenewalAlerts(): UtilityPlanRenewalAlert {
  return { window_days: 45, expired: [], expiring_soon: [], total_needing_attention: 0 };
}

export function noRateComparison(): UtilityPlanRateComparison {
  return { material_gap_pct: 10, above_market: [], not_compared: [], total_above_market: 0, has_stale_benchmark: false };
}

export function noPremiumComparison(): InsurancePremiumComparison {
  return {
    material_gap_pct: 15,
    benchmark: null,
    above_market: [],
    not_compared: [],
    total_above_market: 0,
    total_considered: 0,
    has_stale_benchmark: false,
  };
}

/** Answers the app's own requests, so a screen test runs through the real API client. */
export function startTransactionServer(transactions: Transaction[], properties: Property[] = [aProperty()]): FakeTransactionServer {
  const server: FakeTransactionServer = {
    transactions,
    properties,
    vendors: [],
    role: "owner",
    offline: false,
    failWritesWith: null,
    bulkDeletesBeforeFailing: null,
    bulkApprovesBeforeFailing: null,
    failListFromOffset: null,
    retroactiveCount: 0,
    summary: { revenue: 0, expenses: 0, profit: 0, by_property: [] },
    summaryYears: [2026],
    documents: [],
    pendingReceipts: 0,
    pendingPayments: 0,
    failSummary: false,
    renewalAlerts: noRenewalAlerts(),
    rateComparison: noRateComparison(),
    premiumComparison: noPremiumComparison(),
    duplicates: [],
    bankImportResult: {
      imported: 2,
      skipped_duplicates: 1,
      format_detected: "chase",
      preview: [
        { date: "2026-03-02", vendor: "Shell", amount: "40.00", transaction_type: "expense", category: "maintenance" },
        { date: "2026-03-03", vendor: "Tenant rent", amount: "1200.00", transaction_type: "income", category: "rental_revenue" },
      ],
    },
    bankImportFailure: null,
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
    if (config.url === "/vendors") return respond({ items: server.vendors, total: server.vendors.length, has_more: false });
    if (config.url?.startsWith("/vendors/")) {
      const vendor = server.vendors.find((row) => row.id === config.url?.split("/")[2]);
      return vendor ? respond(vendor) : respond({ detail: "Vendor not found" }, 404);
    }
    if (config.url === "/documents") return respond(server.documents);
    if (config.url === "/summary/years") return respond(server.summaryYears);
    if (config.url === "/transactions/attribution-review-queue") {
      return respond({ items: [], pending_count: server.pendingPayments });
    }
    if (config.url === "/rent-receipts/pending") {
      return respond({ items: [], total: server.pendingReceipts, pending_count: server.pendingReceipts, gmail_state: "ready" });
    }
    if (config.url?.startsWith("/summary")) {
      return server.failSummary ? respond({ detail: "nope" }, 500) : respond({ ...EMPTY_SUMMARY, ...server.summary });
    }
    if (config.url === "/utility-plans/renewal-alerts") return respond(server.renewalAlerts);
    if (config.url === "/utility-plans/rate-comparison") return respond(server.rateComparison);
    if (config.url === "/insurance-policies/premium-comparison") return respond(server.premiumComparison);
    if (config.url === "/transactions/review-count") {
      return respond({ count: server.transactions.filter((row) => REVIEWABLE.includes(row.status)).length });
    }
    if (config.url === "/transactions" && config.method === "post") {
      if (server.failWritesWith !== null) return respond({ detail: "nope" }, server.failWritesWith);
      const created = aTransaction({ id: `new${server.transactions.length}`, ...(JSON.parse(String(config.data)) as Partial<Transaction>) });
      server.transactions.unshift(created);
      return respond(created, 201);
    }
    if (config.url === "/imports/bank-csv") {
      const failure = server.bankImportFailure;
      if (failure === "offline") return Promise.reject(Object.assign(new Error("Network Error"), { config }));
      if (failure) return respond({ detail: "A developer's message" }, failure.status);
      server.bankImportResult.preview.forEach((row, index) => {
        server.transactions.unshift(
          aTransaction({ id: `imp${server.transactions.length}-${index}`, vendor: row.vendor, transaction_date: row.date, amount: row.amount, transaction_type: row.transaction_type, status: "approved", property_id: null } as Partial<Transaction>),
        );
      });
      return respond(server.bankImportResult, 200);
    }
    if (config.url === "/transactions/duplicates") return respond({ pairs: server.duplicates, total: server.duplicates.length });
    if (config.url?.startsWith("/transactions/duplicates/")) {
      if (server.failWritesWith !== null) return respond({ detail: "nope" }, server.failWritesWith);
      const body = JSON.parse(String(config.data)) as { transaction_ids?: string[]; delete_ids?: string[]; transaction_a_id?: string; transaction_b_id?: string };
      const gone = [...(body.transaction_ids ?? []), ...(body.delete_ids ?? []), ...(body.transaction_a_id ? [body.transaction_a_id, body.transaction_b_id] : [])];
      server.duplicates = server.duplicates.filter((pair) => !gone.includes(pair.transaction_a.id) && !gone.includes(pair.transaction_b.id));
      if (config.url.endsWith("/keep")) return respond({ kept: 1, deleted: body.delete_ids?.length ?? 0 });
      if (config.url.endsWith("/merge")) return respond({ merged: true, surviving_id: "s1" });
      return respond({ reviewed: body.transaction_ids?.length ?? 0 });
    }
    if (config.url === "/transactions/bulk-approve") {
      if (server.failWritesWith !== null) return respond({ detail: "nope" }, server.failWritesWith);
      const { ids } = JSON.parse(String(config.data)) as { ids: string[] };
      if (server.bulkApprovesBeforeFailing !== null) {
        if (server.bulkApprovesBeforeFailing <= 0) return respond({ detail: "nope" }, 500);
        server.bulkApprovesBeforeFailing -= 1;
      }
      const approvable = server.transactions.filter((row) => ids.includes(row.id) && REVIEWABLE.includes(row.status) && row.property_id);
      approvable.forEach((row) => {
        row.status = "approved";
      });
      return respond({ approved: approvable.length, skipped: ids.length - approvable.length });
    }
    if (config.url === "/transactions/bulk-delete") {
      if (server.role === "viewer") return respond({ detail: "Viewers have read-only access" }, 403);
      if (server.failWritesWith !== null) return respond({ detail: "nope" }, server.failWritesWith);
      const { ids } = JSON.parse(String(config.data)) as { ids: string[] };
      // The backend's request schema: 1 to MAX_BULK_TRANSACTION_IDS ids.
      if (ids.length < 1 || ids.length > MAX_BULK_TRANSACTION_IDS) return respond({ detail: [{ msg: "ids: invalid length" }] }, 422);
      if (server.bulkDeletesBeforeFailing !== null) {
        if (server.bulkDeletesBeforeFailing <= 0) return respond({ detail: "nope" }, 500);
        server.bulkDeletesBeforeFailing -= 1;
      }
      const before = server.transactions.length;
      server.transactions = server.transactions.filter((row) => !ids.includes(row.id));
      const deleted = before - server.transactions.length;
      return respond({ deleted, skipped: new Set(ids).size - deleted });
    }
    if (config.url === "/transactions") {
      const params = (config.params ?? {}) as Record<string, string | number | boolean | undefined>;
      const offset = Number(params.offset ?? 0);
      if (server.failListFromOffset !== null && offset >= server.failListFromOffset) return respond({ detail: "nope" }, 500);
      const matches = server.transactions.filter(
        (row) =>
          (!params.to_review || REVIEWABLE.includes(row.status)) &&
          (!params.status || row.status === params.status) &&
          (!params.start_date || row.transaction_date >= String(params.start_date)) &&
          (!params.end_date || row.transaction_date <= String(params.end_date)) &&
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
