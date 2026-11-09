import api from "@platform/core/lib/api";
import type { AxiosAdapter, InternalAxiosRequestConfig } from "axios";

export interface UtilityRequest {
  method?: string;
  url?: string;
  data?: unknown;
}

/** What a route answers. "hold" never answers, "fail" is a 500, "gone" a 404. */
type Answer = unknown;

export interface UtilityServer {
  role: string;
  list: Answer;
  detail: Answer;
  alerts: Answer;
  comparison: Answer;
  benchmarks: Answer;
  offers: Answer;
  properties: Answer;
  /** Status every write is refused with, or "offline" for no answer at all. 200 lets writes through. */
  write: number | "offline";
  requests: UtilityRequest[];
}

export const NO_ALERTS = { window_days: 45, expired: [], expiring_soon: [], total_needing_attention: 0 };
export const NO_COMPARISON = { material_gap_pct: 10, above_market: [], not_compared: [], total_above_market: 0, has_stale_benchmark: false };

function reply(answer: Answer, config: InternalAxiosRequestConfig) {
  if (answer === "hold") return new Promise<never>(() => undefined);
  if (answer === "fail") return Promise.reject({ response: { status: 500, data: {} }, config, isAxiosError: true });
  if (answer === "gone") return Promise.reject({ response: { status: 404, data: {} }, config, isAxiosError: true });
  return Promise.resolve({ data: answer, status: 200, statusText: "OK", headers: {}, config });
}

/** Answers every utility-plan route the phone calls. Change a field on the result to change what the next request gets. */
export function startUtilityServer(overrides: Partial<UtilityServer> = {}): UtilityServer {
  const server: UtilityServer = {
    role: "owner",
    list: { items: [], total: 0, has_more: false },
    detail: {},
    alerts: NO_ALERTS,
    comparison: NO_COMPARISON,
    benchmarks: [],
    offers: { groups: [], reference_annual_kwh: 12_000, has_any_offers: false },
    properties: [{ id: "pr1", name: "Oak Street" }],
    write: 200,
    requests: [],
    ...overrides,
  };
  const adapter: AxiosAdapter = (config) => {
    server.requests.push(config);
    if (config.url === "/organizations") return reply([{ id: "w1", name: "Mine", org_role: server.role }], config);
    if (config.method?.toLowerCase() !== "get") {
      if (server.write === "offline") return Promise.reject(new Error("Network Error"));
      if (server.write !== 200) return Promise.reject({ response: { status: server.write, data: { detail: "raw server text" } }, config, isAxiosError: true });
      return reply(server.detail, config);
    }
    const url = config.url ?? "";
    if (url === "/properties") return reply(server.properties, config);
    if (url === "/market-rate-benchmarks") return reply(server.benchmarks, config);
    if (url === "/utility-plans") return reply(server.list, config);
    if (url === "/utility-plans/renewal-alerts") return reply(server.alerts, config);
    if (url === "/utility-plans/rate-comparison") return reply(server.comparison, config);
    if (url === "/utility-plans/offers") return reply(server.offers, config);
    return reply(server.detail, config);
  };
  api.defaults.adapter = adapter;
  return server;
}

export function writesTo(server: UtilityServer, method: "post" | "patch" | "put" | "delete"): UtilityRequest[] {
  return server.requests.filter((request) => request.method?.toLowerCase() === method);
}
