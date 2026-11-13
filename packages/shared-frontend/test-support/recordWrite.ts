/**
 * Records a write the page sent to a stub, in the shared SentRequest shape
 * (the path under the API base, the JSON body or null), and hands the body
 * back. For E2E tests only.
 */
import type { Request } from "@playwright/test";
import { pathUnderBase } from "./apiPath";
import { DEFAULT_API_BASE } from "./constants/defaultApiBase";
import type { SentRequest } from "./types/SentRequest";

export function recordWrite(log: SentRequest[], request: Request, apiBase: string = DEFAULT_API_BASE): unknown {
  const body = (request.postDataJSON() as unknown) ?? null;
  const url = new URL(request.url());
  log.push({ method: request.method(), path: pathUnderBase(url, apiBase) ?? url.pathname, body });
  return body;
}
