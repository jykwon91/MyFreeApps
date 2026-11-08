/**
 * Every triage call goes through here, on the app's shared axios instance — so the operator's session
 * (Bearer token) is attached like any other signed-in call, and a 401 signs the screen out (the shared
 * interceptor clears the token; `TriageAuthGate` sends the operator to /login and back). It uses the fetch
 * adapter for `cache: "no-store"`, no referrer and `keepalive` on writes, so a write flushed while the tab
 * closes still reaches the server. PATCH and merge send the story's `updated_at` as `If-Match`.
 */
import { isAxiosError } from "axios";
import api from "@/lib/api";
import { TRIAGE_API_BASE } from "@/games/wow-forever/data/featureRequests/triage/triageConfig";
import { parseRetryAfter } from "@/games/wow-forever/lib/featureRequests/triage/retryAfter";
import { triageErrorFrom } from "@/games/wow-forever/lib/featureRequests/triage/triageErrors";
import type { TriageRequestArgs } from "@/games/wow-forever/types/featureRequests/triage/triageRequestArgs";
import type { TriageResult } from "@/games/wow-forever/types/featureRequests/triage/triageResult";

const RETRY_AFTER_HEADER = "retry-after";

function retryAfterFrom(headers: unknown): number | null {
  const value = typeof headers === "object" && headers !== null ? (headers as Record<string, unknown>)[RETRY_AFTER_HEADER] : null;
  return parseRetryAfter(typeof value === "string" ? value : null);
}

export async function triageRequest<T>(args: TriageRequestArgs): Promise<TriageResult<T>> {
  try {
    const response = await api.request<T>({
      url: `${TRIAGE_API_BASE}${args.path}`,
      method: args.method,
      data: args.body,
      headers: args.ifMatch === undefined ? undefined : { "If-Match": args.ifMatch },
      adapter: "fetch",
      fetchOptions: { cache: "no-store", referrerPolicy: "no-referrer", keepalive: args.method !== "GET" },
    });
    return { ok: true, data: response.data };
  } catch (error) {
    if (!isAxiosError(error) || error.response === undefined) {
      return { ok: false, error: triageErrorFrom(undefined, null, null) };
    }
    const { status, data, headers } = error.response;
    return { ok: false, error: triageErrorFrom(status, data, retryAfterFrom(headers)) };
  }
}
