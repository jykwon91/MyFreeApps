import api from "@platform/core/lib/api";
import type { AxiosAdapter, AxiosResponse, InternalAxiosRequestConfig } from "axios";
import type { FakeRoute } from "./types/FakeRoute";
import type { SentRequest } from "./types/SentRequest";

function bodyOf(config: InternalAxiosRequestConfig): Record<string, unknown> {
  const raw: unknown = config.data;
  return typeof raw === "string" && raw !== "" ? (JSON.parse(raw) as Record<string, unknown>) : {};
}

/** Answers requests by "METHOD /path", and records each one. Anything unrouted gets a 404. */
export function serve(routes: Record<string, FakeRoute>): SentRequest[] {
  const sent: SentRequest[] = [];
  const adapter: AxiosAdapter = async (config) => {
    const route = `${(config.method ?? "get").toUpperCase()} ${config.url ?? ""}`;
    const body = bodyOf(config);
    const authorization = config.headers.Authorization;
    sent.push({ route, body, authorization: typeof authorization === "string" ? authorization : undefined });
    const reply = (await routes[route]?.(body)) ?? { status: 404, data: { detail: "Not Found" } };
    const response: AxiosResponse = { data: reply.data ?? null, status: reply.status, statusText: "", headers: {}, config };
    if (reply.status < 400) return response;
    throw Object.assign(new Error(String(reply.status)), { config, response, isAxiosError: true });
  };
  api.defaults.adapter = adapter;
  return sent;
}
