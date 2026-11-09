import type { SignedLeaseDetail } from "@mybookkeeper/api-client/types/lease/signed-lease-detail";
import type { SignedLeaseTemplatePrefillItem } from "@mybookkeeper/api-client/types/lease/signed-lease-template-prefill";
import { act, waitFor } from "@testing-library/react-native";
import api from "@platform/core/lib/api";
import type { AxiosAdapter, AxiosRequestConfig } from "axios";
import { aLease } from "./aLease";

export type LeaseWriteFailure = { status: number; detail?: unknown } | "offline";
export type LeaseWriteRoute = "patch" | "attachmentPatch" | "attachmentDelete" | "prefill" | "addTemplates" | "import" | "templates" | "applicants" | "listings";

export interface FakeLeaseWritesServer {
  lease: SignedLeaseDetail;
  role: string;
  templates: { id: string; name: string }[];
  applicants: { id: string; legal_name: string | null }[];
  listings: { id: string; title: string }[];
  prefill: SignedLeaseTemplatePrefillItem[];
  failures: Partial<Record<LeaseWriteRoute, LeaseWriteFailure>>;
  requests: AxiosRequestConfig[];
}

export function aPrefillItem(key: string, overrides: Partial<SignedLeaseTemplatePrefillItem> = {}): SignedLeaseTemplatePrefillItem {
  return { key, display_label: key, input_type: "text", required: false, value: "", provenance: null, is_from_existing_values: false, ...overrides };
}

export function aTemplateSummary(id: string, name: string) {
  return { id, user_id: "u1", organization_id: "w1", name, description: null, version: 1, file_count: 1, placeholder_count: 2, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" };
}

/** Every request the lease screens that write can make, answered in memory. */
export function startLeaseWritesServer(overrides: Partial<FakeLeaseWritesServer> = {}): FakeLeaseWritesServer {
  const server: FakeLeaseWritesServer = {
    lease: aLease(),
    role: "owner",
    templates: [{ id: "t1", name: "Standard lease" }, { id: "t2", name: "Pet addendum" }],
    applicants: [{ id: "a1", legal_name: "Dana Reed" }, { id: "a2", legal_name: "Sam Lee" }],
    listings: [{ id: "li1", title: "Back room" }],
    prefill: [],
    failures: {},
    requests: [],
    ...overrides,
  };
  const adapter: AxiosAdapter = (config) => {
    const respond = (data: unknown, status = 200) => {
      const response = { data: JSON.parse(JSON.stringify(data)), status, statusText: "", headers: {}, config };
      if (status < 400) return Promise.resolve(response);
      return Promise.reject(Object.assign(new Error(String(status)), { config, response, isAxiosError: true }));
    };
    const failed = (route: LeaseWriteRoute) => {
      server.requests.push(config);
      const failure = server.failures[route];
      if (!failure) return null;
      return failure === "offline"
        ? Promise.reject(Object.assign(new Error("Network Error"), { config }))
        : respond({ detail: failure.detail ?? "A developer's message" }, failure.status);
    };
    const url = config.url ?? "";
    const method = (config.method ?? "get").toLowerCase();
    if (url === "/organizations") {
      server.requests.push(config);
      return respond([{ id: "w1", name: "Mine", org_role: server.role }]);
    }
    if (url === "/lease-templates") {
      return failed("templates") ?? respond({ items: server.templates.map((t) => aTemplateSummary(t.id, t.name)), total: server.templates.length, has_more: false });
    }
    if (url === "/applicants") {
      return failed("applicants") ?? respond({ items: server.applicants.map((a) => ({ ...a, organization_id: "w1", user_id: "u1", inquiry_id: null, employer_or_hospital: null, contract_start: null, contract_end: null, stage: "approved", created_at: "2026-11-01T12:00:00Z", updated_at: "2026-11-01T12:00:00Z" })), total: server.applicants.length, has_more: false });
    }
    if (url === "/listings") {
      return failed("listings") ?? respond({ items: server.listings, total: server.listings.length, has_more: false });
    }
    if (url === "/signed-leases/import" && method === "post") {
      return failed("import") ?? respond(aLease({ id: "imported1", attachments: [] }), 201);
    }
    if (url === `/signed-leases/${server.lease.id}` && method === "get") return respond(server.lease);
    if (url === `/signed-leases/${server.lease.id}` && method === "patch") {
      const refused = failed("patch");
      if (refused) return refused;
      server.lease = { ...server.lease, ...JSON.parse(String(config.data)) };
      return respond(server.lease);
    }
    const file = /^\/signed-leases\/[^/]+\/attachments\/([^/]+)$/.exec(url);
    if (file && method === "patch") {
      const refused = failed("attachmentPatch");
      if (refused) return refused;
      const { kind } = JSON.parse(String(config.data));
      server.lease = { ...server.lease, attachments: server.lease.attachments.map((a) => (a.id === file[1] ? { ...a, kind } : a)) };
      return respond(server.lease.attachments.find((a) => a.id === file[1]));
    }
    if (file && method === "delete") {
      const refused = failed("attachmentDelete");
      if (refused) return refused;
      server.lease = { ...server.lease, attachments: server.lease.attachments.filter((a) => a.id !== file[1]) };
      return respond(null, 204);
    }
    if (url.endsWith("/template-prefill") && method === "post") return failed("prefill") ?? respond({ items: server.prefill });
    if (url.endsWith("/templates") && method === "post") return failed("addTemplates") ?? respond(server.lease);
    return respond({ detail: "Not found" }, 404);
  };
  api.defaults.adapter = adapter;
  return server;
}

export const lastRequest = (server: FakeLeaseWritesServer, method: string, urlEnd: string): AxiosRequestConfig | undefined =>
  [...server.requests].reverse().find((request) => request.method?.toLowerCase() === method && request.url?.endsWith(urlEnd));

/** Waits for the answer about the person's role, so a check that something is hidden isn't passing before it's known. */
export async function roleKnown(server: FakeLeaseWritesServer): Promise<void> {
  await waitFor(() => expect(server.requests.some((request) => request.url === "/organizations")).toBe(true));
  await act(async () => undefined);
}
