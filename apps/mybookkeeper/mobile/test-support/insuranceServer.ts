import type { Document } from "@mybookkeeper/api-client/types/document/document";
import type { Property } from "@mybookkeeper/api-client/types/property/property";
import type { InsuranceBenchmark } from "@mybookkeeper/api-client/types/insurance/insurance-benchmark";
import type { InsuranceMarketWatch } from "@mybookkeeper/api-client/types/insurance/insurance-market-watch";
import type { InsurancePolicyAttachment } from "@mybookkeeper/api-client/types/insurance/insurance-policy-attachment";
import type { InsurancePolicyDetail } from "@mybookkeeper/api-client/types/insurance/insurance-policy-detail";
import type { InsurancePolicyDraft } from "@mybookkeeper/api-client/types/insurance/insurance-policy-draft";
import type { InsurancePremiumComparison } from "@mybookkeeper/api-client/types/insurance/insurance-premium-comparison";
import api from "@platform/core/lib/api";
import type { AxiosAdapter, AxiosRequestConfig } from "axios";
import { aInsurancePolicySummary } from "./aInsurancePolicySummary";

export function anAttachment(overrides: Partial<InsurancePolicyAttachment> = {}): InsurancePolicyAttachment {
  return {
    id: "f1",
    policy_id: "p1",
    filename: "declarations.pdf",
    storage_key: "k",
    content_type: "application/pdf",
    size_bytes: 10,
    kind: "policy_document",
    uploaded_by_user_id: "u1",
    uploaded_at: "2026-01-01T00:00:00Z",
    presigned_url: "https://files.example/old",
    is_available: true,
    ...overrides,
  };
}

export function aPolicyDetail(overrides: Partial<InsurancePolicyDetail> = {}): InsurancePolicyDetail {
  return {
    ...aInsurancePolicySummary(),
    user_id: "u1",
    organization_id: "o1",
    source_document_id: null,
    policy_number: "HO-123456",
    notes: "Agent is Dana",
    attachments: [anAttachment()],
    ...overrides,
  };
}

export function aBenchmark(overrides: Partial<InsuranceBenchmark> = {}): InsuranceBenchmark {
  return {
    id: "b1",
    annual_premium_cents: 120_000,
    coverage_amount_cents: 40_000_000,
    region_label: "Houston",
    source: "Agent quote",
    observed_on: "2026-02-01",
    notes: null,
    rate_cents_per_1000_coverage: "300.00",
    is_stale: false,
    created_at: "2026-02-01T00:00:00Z",
    updated_at: "2026-02-01T00:00:00Z",
    ...overrides,
  };
}

export function aDraft(overrides: Partial<InsurancePolicyDraft> = {}): InsurancePolicyDraft {
  return {
    source_document_id: "d9",
    policy_name: "Read policy",
    carrier: "Read Mutual",
    policy_number: "RD-1",
    effective_date: "2026-01-01",
    expiration_date: "2027-01-01",
    coverage_amount_cents: 30_000_000,
    premium_cents: 10_000,
    premium_frequency: "monthly",
    fees_and_taxes_cents: null,
    deductible_cents: 100_000,
    wind_hail_deductible_pct: "1.50",
    notes: "Summary of the policy.",
    confidence: "high",
    warnings: [],
    unrepresented: [],
    ...overrides,
  };
}

export function aProperty(overrides: Partial<Property> = {}): Property {
  return { id: "pr1", name: "Oak Street", address: null, classification: "investment", type: "long_term", is_active: true, activity_periods: [], created_at: "2026-01-01T00:00:00Z", ...overrides };
}

export function aDocument(overrides: Partial<Document> = {}): Document {
  return {
    id: "d1", user_id: "u1", property_id: null, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z", file_name: "renewal.pdf",
    file_type: "pdf", document_type: null, file_mime_type: "application/pdf", email_message_id: null, external_id: null, external_source: null,
    source: "upload", status: "completed", error_message: null, batch_id: null, is_escrow_paid: false, deleted_at: null, ...overrides,
  } as Document;
}

export const NOTHING_TRACKED: InsurancePremiumComparison = {
  material_gap_pct: 10,
  benchmark: null,
  above_market: [],
  not_compared: [],
  total_above_market: 0,
  total_considered: 0,
  has_stale_benchmark: false,
};

export const EMPTY_RATE_WATCH: InsuranceMarketWatch = {
  outlooks: [],
  market_rising: [],
  market_flat: [],
  has_any_increase: false,
  checked_policy_count: 0,
  feed_unavailable_reason: null,
};

/** A status to fail with, or "offline" for no answer at all. Keyed "METHOD /path/with/:id". */
export type InsuranceFailure = number | "offline";

export interface FakeInsuranceServer {
  role: string;
  policies: InsurancePolicyDetail[];
  properties: Property[];
  documents: Document[];
  benchmark: InsuranceBenchmark | null;
  comparison: InsurancePremiumComparison;
  rateWatch: InsuranceMarketWatch;
  draft: InsurancePolicyDraft;
  failures: Record<string, InsuranceFailure>;
  requests: AxiosRequestConfig[];
}

function route(config: AxiosRequestConfig): string {
  const path = (config.url ?? "").replace(/\/(p|f)(\d+|new)(?=\/|$)/g, "/:id");
  return `${(config.method ?? "get").toUpperCase()} ${path}`;
}

export function startInsuranceServer(overrides: Partial<FakeInsuranceServer> = {}): FakeInsuranceServer {
  const server: FakeInsuranceServer = {
    role: "owner",
    policies: [aPolicyDetail()],
    properties: [aProperty()],
    documents: [],
    benchmark: null,
    comparison: NOTHING_TRACKED,
    rateWatch: EMPTY_RATE_WATCH,
    draft: aDraft(),
    failures: {},
    requests: [],
    ...overrides,
  };
  const adapter: AxiosAdapter = (config) => {
    const respond = (data: unknown, status = 200) => {
      const response = { data: data === undefined ? data : JSON.parse(JSON.stringify(data)), status, statusText: "", headers: {}, config };
      if (status < 400) return Promise.resolve(response);
      return Promise.reject(Object.assign(new Error(String(status)), { config, response, isAxiosError: true }));
    };
    if (config.url === "/organizations") return respond([{ id: "w1", name: "Mine", org_role: server.role }]);
    server.requests.push(config);
    const failure = server.failures[route(config)];
    if (failure === "offline") return Promise.reject(Object.assign(new Error("Network Error"), { config, isAxiosError: true }));
    if (failure) return respond({ detail: "A developer's message" }, failure);
    const method = (config.method ?? "get").toLowerCase();
    const url = config.url ?? "";
    const policyId = /^\/insurance-policies\/([^/]+)/.exec(url)?.[1];
    if (url === "/properties") return respond(server.properties);
    if (url === "/documents") return respond(server.documents);
    if (url === "/insurance-benchmarks") {
      if (method === "get") return respond(server.benchmark);
      if (method === "delete") {
        server.benchmark = null;
        return respond(undefined, 204);
      }
      server.benchmark = aBenchmark(JSON.parse(String(config.data)));
      return respond(server.benchmark);
    }
    if (url === "/insurance-market/rate-watch") return respond(server.rateWatch);
    if (url === "/insurance-policies/premium-comparison") return respond(server.comparison);
    if (url === "/insurance-policies/extract" || url === "/insurance-policies/extract-upload") return respond(server.draft);
    if (url === "/insurance-policies" && method === "get") {
      const params = (config.params ?? {}) as { expiring_before?: string };
      const items = server.policies.filter((policy) => !params.expiring_before || (policy.expiration_date !== null && policy.expiration_date <= params.expiring_before));
      return respond({ items, total: items.length, has_more: false });
    }
    if (url === "/insurance-policies" && method === "post") {
      const created = aPolicyDetail({ id: "pnew", ...JSON.parse(String(config.data)), attachments: [] });
      server.policies = [...server.policies, created];
      return respond(created, 201);
    }
    const policy = server.policies.find((row) => row.id === policyId);
    if (!policy) return respond({ detail: "Not found" }, 404);
    if (url.endsWith("/attachments") && method === "post") {
      const added = anAttachment({ id: "fnew" });
      policy.attachments = [...policy.attachments, added];
      return respond(added, 201);
    }
    if (url.includes("/attachments/") && method === "delete") {
      policy.attachments = policy.attachments.filter((file) => !url.endsWith(`/${file.id}`));
      return respond(undefined, 204);
    }
    if (method === "patch") {
      Object.assign(policy, JSON.parse(String(config.data)));
      return respond(policy);
    }
    if (method === "delete") {
      server.policies = server.policies.filter((row) => row !== policy);
      return respond(undefined, 204);
    }
    return respond(policy);
  };
  api.defaults.adapter = adapter;
  return server;
}

/** The last request that changed something, with its body parsed. */
export function lastInsuranceWrite(server: FakeInsuranceServer): { route: string; body: Record<string, unknown> | undefined; config: AxiosRequestConfig } | null {
  const write = [...server.requests].reverse().find((request) => request.method !== "get");
  if (!write) return null;
  const isForm = typeof FormData !== "undefined" && write.data instanceof FormData;
  return { route: route(write), body: write.data && !isForm ? JSON.parse(String(write.data)) : undefined, config: write };
}
