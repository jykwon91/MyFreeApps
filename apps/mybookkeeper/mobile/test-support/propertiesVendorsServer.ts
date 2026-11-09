import type { Property } from "@mybookkeeper/api-client/types/property/property";
import type { VendorResponse } from "@mybookkeeper/api-client/types/vendor/vendor-response";
import type { VendorSummary } from "@mybookkeeper/api-client/types/vendor/vendor-summary";
import api from "@platform/core/lib/api";
import type { AxiosAdapter, AxiosPromise, AxiosRequestConfig, AxiosResponse } from "axios";

export interface PropertiesVendorsServer {
  role: string;
  properties: Property[];
  vendors: VendorResponse[];
  /** Everything asked of the server except the workspace list, in order. */
  requests: AxiosRequestConfig[];
  /** Every read fails with this, so the lists can be shown failing to load. */
  failReadsWith: number | null;
  /** Every write fails with this status, once the role allows it. */
  failWritesWith: number | null;
  /** The next write is saved, then the answer is lost. */
  loseAnswerAfterSaving: boolean;
  offline: boolean;
}

export function aProperty(overrides: Partial<Property> = {}): Property {
  return {
    id: "p1",
    name: "Elm House",
    address: "1 Elm St, Austin, TX 78701",
    classification: "investment",
    type: "long_term",
    is_active: true,
    activity_periods: [],
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

export function aVendor(overrides: Partial<VendorResponse> = {}): VendorResponse {
  return {
    id: "v1",
    organization_id: "o1",
    user_id: "u1",
    name: "Reliable Plumbing",
    category: "plumber",
    phone: "(555) 010-1000",
    email: "help@reliable.example",
    address: "12 Pipe Lane, Austin",
    hourly_rate: "95.00",
    flat_rate_notes: "$150 for a clogged drain",
    preferred: false,
    notes: "Ask for Sam",
    last_used_at: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function toSummary(vendor: VendorResponse): VendorSummary {
  const { id, organization_id, user_id, name, category, phone, hourly_rate, preferred, last_used_at, created_at, updated_at } = vendor;
  return { id, organization_id, user_id, name, category, phone, hourly_rate, preferred, last_used_at, created_at, updated_at };
}

/** Answers the workspace list, properties and vendors like the server does, and remembers what it was asked. */
export function startPropertiesVendorsServer(initial: { properties?: Property[]; vendors?: VendorResponse[]; role?: string } = {}): PropertiesVendorsServer {
  const server: PropertiesVendorsServer = {
    role: initial.role ?? "owner",
    properties: initial.properties ?? [],
    vendors: initial.vendors ?? [],
    requests: [],
    failReadsWith: null,
    failWritesWith: null,
    loseAnswerAfterSaving: false,
    offline: false,
  };

  const adapter: AxiosAdapter = (config) => {
    const respond = (data: unknown, status = 200) => {
      // A copy, as the real API sends: the store freezes what it's given, and the rows here keep changing.
      const response = { data: data === undefined ? data : JSON.parse(JSON.stringify(data)), status, statusText: "", headers: {}, config };
      if (status < 400) return Promise.resolve(response as AxiosResponse);
      return Promise.reject(Object.assign(new Error(String(status)), { config, response, isAxiosError: true }));
    };
    if (config.url === "/organizations") return respond([{ id: "w1", name: "Mine", org_role: server.role, is_demo: false }]);
    server.requests.push(config);
    if (server.offline) return Promise.reject(Object.assign(new Error("Network Error"), { config }));
    const method = (config.method ?? "get").toLowerCase();
    if (method === "get" && server.failReadsWith) return respond({ detail: "nope" }, server.failReadsWith);
    if (method !== "get") {
      if (server.role === "viewer") return respond({ detail: "nope" }, 403);
      if (server.failWritesWith) return respond({ detail: "nope" }, server.failWritesWith);
    }
    const sent = config.data ? (JSON.parse(String(config.data)) as Record<string, unknown>) : {};
    const [, resource, id] = (config.url ?? "").split("/");
    const answer = resource === "properties" ? answerProperty(server, method, id, sent, respond) : answerVendor(server, method, id, sent, config, respond);
    if (method !== "get" && server.loseAnswerAfterSaving) {
      server.loseAnswerAfterSaving = false;
      return Promise.reject(Object.assign(new Error("Network Error"), { config }));
    }
    return answer;
  };
  api.defaults.adapter = adapter;
  return server;
}

type Respond = (data: unknown, status?: number) => AxiosPromise;

function answerProperty(server: PropertiesVendorsServer, method: string, id: string | undefined, sent: Record<string, unknown>, respond: Respond) {
  if (method === "get") return respond(server.properties);
  if (method === "post") {
    const made = aProperty({ id: `made${server.properties.length + 1}`, is_active: true, activity_periods: [], type: null, ...(sent as Partial<Property>) });
    server.properties.push(made);
    return respond(made, 201);
  }
  const row = server.properties.find((candidate) => candidate.id === id);
  if (!row) return respond({ detail: "Property not found" }, 404);
  if (method === "delete") {
    server.properties = server.properties.filter((candidate) => candidate !== row);
    return respond(undefined, 204);
  }
  Object.assign(row, sent);
  return respond(row);
}

function answerVendor(server: PropertiesVendorsServer, method: string, id: string | undefined, sent: Record<string, unknown>, config: AxiosRequestConfig, respond: Respond) {
  if (method === "get" && !id) {
    const params = (config.params ?? {}) as { category?: string; preferred?: boolean; limit?: number; offset?: number };
    const offset = Number(params.offset ?? 0);
    const limit = Number(params.limit ?? 25);
    const matches = server.vendors.filter((row) => (!params.category || row.category === params.category) && (params.preferred === undefined || row.preferred === params.preferred));
    return respond({ items: matches.slice(offset, offset + limit).map(toSummary), total: matches.length, has_more: offset + limit < matches.length });
  }
  if (method === "post") {
    const made = aVendor({ id: `made${server.vendors.length + 1}`, ...(sent as Partial<VendorResponse>) });
    server.vendors.push(made);
    return respond(made, 201);
  }
  const row = server.vendors.find((candidate) => candidate.id === id);
  if (!row) return respond({ detail: "Vendor not found" }, 404);
  if (method === "delete") {
    server.vendors = server.vendors.filter((candidate) => candidate !== row);
    return respond(undefined, 204);
  }
  if (method === "patch") Object.assign(row, sent);
  return respond(row);
}

/** The writes of one kind, in order, with their bodies read. */
export function writesOf(server: PropertiesVendorsServer, method: "post" | "patch" | "delete"): { url: string; body: Record<string, unknown> }[] {
  return server.requests
    .filter((request) => request.method?.toLowerCase() === method)
    .map((request) => ({ url: request.url ?? "", body: request.data ? (JSON.parse(String(request.data)) as Record<string, unknown>) : {} }));
}
