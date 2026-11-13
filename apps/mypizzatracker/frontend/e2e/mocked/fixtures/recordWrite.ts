/** Records a write the page sent to a stub, in the shared SentRequest shape. */
import type { Request } from "@playwright/test";
import { DEFAULT_API_BASE } from "@platform/ui/test-support/constants/defaultApiBase";
import type { SentRequest } from "@platform/ui/test-support/types/SentRequest";

export function recordWrite(log: SentRequest[], request: Request): unknown {
  const body = (request.postDataJSON() as unknown) ?? null;
  const path = new URL(request.url()).pathname.slice(DEFAULT_API_BASE.length);
  log.push({ method: request.method(), path, body });
  return body;
}
