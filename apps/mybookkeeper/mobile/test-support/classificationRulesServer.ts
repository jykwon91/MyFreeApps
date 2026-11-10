import type { ClassificationRule } from "@mybookkeeper/api-client/types/classification-rule/classification-rule";
import type { Property } from "@mybookkeeper/api-client/types/property/property";
import api from "@platform/core/lib/api";
import type { AxiosAdapter, AxiosRequestConfig, AxiosResponse } from "axios";

export interface ClassificationRulesServer {
  role: string;
  rules: ClassificationRule[];
  properties: Property[];
  requests: AxiosRequestConfig[];
  /** Every read fails with this status. */
  failReadsWith: number | null;
  /** Every delete fails with this status, once the role allows it. */
  failDeletesWith: number | null;
  /** The next delete never reaches the server: no answer comes back. */
  deletesLoseConnection: boolean;
  /** Property reads fail with this status. */
  failPropertiesWith: number | null;
  /** Reads never answer, so loading can be seen. */
  holdReads: boolean;
  /** Only property reads never answer. */
  holdProperties: boolean;
}

export function aRule(overrides: Partial<ClassificationRule> = {}): ClassificationRule {
  return {
    id: "r1",
    organization_id: "o1",
    match_type: "vendor",
    match_pattern: "home depot",
    match_context: null,
    category: "maintenance",
    property_id: null,
    activity_id: null,
    source: "user_correction",
    priority: 0,
    times_applied: 3,
    is_active: true,
    created_at: "2026-10-01T12:00:00Z",
    ...overrides,
  };
}

/** Answers the workspace list, properties and classification rules like the server does, with owner/admin-only writes. */
export function startClassificationRulesServer(initial: { rules?: ClassificationRule[]; properties?: Property[]; role?: string } = {}): ClassificationRulesServer {
  const server: ClassificationRulesServer = {
    role: initial.role ?? "owner",
    rules: initial.rules ?? [],
    properties: initial.properties ?? [],
    requests: [],
    failReadsWith: null,
    failDeletesWith: null,
    deletesLoseConnection: false,
    failPropertiesWith: null,
    holdReads: false,
    holdProperties: false,
  };
  const adapter: AxiosAdapter = (config) => {
    const respond = (data: unknown, status = 200) => {
      const response = { data: data === undefined ? data : JSON.parse(JSON.stringify(data)), status, statusText: "", headers: {}, config };
      if (status < 400) return Promise.resolve(response as AxiosResponse);
      return Promise.reject(Object.assign(new Error(String(status)), { config, response, isAxiosError: true }));
    };
    if (config.url === "/organizations") return respond([{ id: "w1", name: "Mine", org_role: server.role, is_demo: false }]);
    server.requests.push(config);
    const method = (config.method ?? "get").toLowerCase();
    if (method === "get") {
      const isProperties = config.url === "/properties";
      if (server.holdReads || (isProperties && server.holdProperties)) return new Promise<AxiosResponse>(() => undefined);
      if (isProperties && server.failPropertiesWith) return respond({ detail: "nope" }, server.failPropertiesWith);
      if (server.failReadsWith) return respond({ detail: "nope" }, server.failReadsWith);
      return respond(config.url === "/properties" ? server.properties : server.rules);
    }
    if (server.role !== "owner" && server.role !== "admin") return respond({ detail: "nope" }, 403);
    if (server.deletesLoseConnection) return Promise.reject(Object.assign(new Error("Network Error"), { config }));
    if (server.failDeletesWith) return respond({ detail: "nope" }, server.failDeletesWith);
    const id = (config.url ?? "").split("/")[2];
    const row = server.rules.find((candidate) => candidate.id === id);
    if (!row) return respond({ detail: "Classification rule not found" }, 404);
    server.rules = server.rules.filter((candidate) => candidate !== row);
    return respond(undefined, 204);
  };
  api.defaults.adapter = adapter;
  return server;
}

export function deletesOf(server: ClassificationRulesServer): string[] {
  return server.requests.filter((request) => request.method?.toLowerCase() === "delete").map((request) => request.url ?? "");
}
