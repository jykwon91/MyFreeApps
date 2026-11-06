/**
 * Every triage call goes through here: the key in the `X-MGA-Triage-Token` header (never the URL),
 * `If-Match` for writes, `cache: "no-store"`, no cookies, no referrer. A 404 or 401 means the key was
 * refused (a wrong key and a switched-off triage API look the same) — the screen locks at once.
 */
import { TRIAGE_API_BASE, TRIAGE_TOKEN_HEADER } from "@/games/wow-forever/data/featureRequests/triage/triageConfig";
import { getTriageKey, lockTriage, touchTriage } from "@/games/wow-forever/lib/featureRequests/triage/triageKeyStore";
import { parseRetryAfter } from "@/games/wow-forever/lib/featureRequests/triage/retryAfter";
import { DETAIL_LOCKED, triageErrorFrom } from "@/games/wow-forever/lib/featureRequests/triage/triageErrors";
import type { TriageRequestArgs } from "@/games/wow-forever/types/featureRequests/triage/triageRequestArgs";
import type { TriageResult } from "@/games/wow-forever/types/featureRequests/triage/triageResult";

const LOCKING_STATUSES: ReadonlySet<number> = new Set([401, 404]);

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export async function triageRequest<T>(args: TriageRequestArgs): Promise<TriageResult<T>> {
  const usingStoredKey = args.candidateKey === undefined;
  const key = args.candidateKey ?? getTriageKey();
  if (key === null) return { ok: false, error: triageErrorFrom(null, { detail: DETAIL_LOCKED }, null) };

  const headers: Record<string, string> = { Accept: "application/json", [TRIAGE_TOKEN_HEADER]: key };
  if (args.body !== undefined) headers["Content-Type"] = "application/json";
  if (args.ifMatch !== undefined) headers["If-Match"] = args.ifMatch;

  let response: Response;
  try {
    response = await fetch(`${TRIAGE_API_BASE}${args.path}`, {
      method: args.method,
      headers,
      body: args.body === undefined ? undefined : JSON.stringify(args.body),
      cache: "no-store",
      credentials: "omit",
      referrerPolicy: "no-referrer",
      // A write flushed while the tab closes still reaches the server.
      keepalive: args.method !== "GET",
    });
  } catch {
    return { ok: false, error: triageErrorFrom(null, null, null) };
  }

  if (response.ok) {
    if (usingStoredKey) touchTriage();
    return { ok: true, data: (await readJson(response)) as T };
  }
  if (usingStoredKey && LOCKING_STATUSES.has(response.status)) lockTriage("rejected");
  const retryAfter = parseRetryAfter(response.headers.get("Retry-After"));
  return { ok: false, error: triageErrorFrom(response.status, await readJson(response), retryAfter) };
}
