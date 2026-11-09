import api from "@platform/core/lib/api";
import type { AxiosAdapter, AxiosRequestConfig } from "axios";

export interface TaxCall {
  method: string;
  url: string;
  data: unknown;
}

export interface TaxAnswer {
  status?: number;
  data?: unknown;
}

/** Answers each request with what `respond` says (200 with no body when it says nothing) and records it. */
export function startTaxServer(respond: (call: TaxCall) => TaxAnswer | Promise<TaxAnswer> | undefined): { calls: TaxCall[] } {
  const calls: TaxCall[] = [];
  const adapter: AxiosAdapter = async (config: AxiosRequestConfig & { url?: string }) => {
    const call: TaxCall = { method: (config.method ?? "get").toLowerCase(), url: config.url ?? "", data: config.data ? JSON.parse(String(config.data)) : undefined };
    calls.push(call);
    const { status = 200, data = {} } = (await respond(call)) ?? {};
    const answer = { data, status, statusText: "", headers: {}, config } as never;
    if (status >= 400) throw Object.assign(new Error("refused"), { isAxiosError: true, response: answer, config });
    return answer;
  };
  api.defaults.adapter = adapter;
  return { calls };
}

export function writesOnly(calls: readonly TaxCall[]): TaxCall[] {
  return calls.filter((call) => call.method !== "get");
}
