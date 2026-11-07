import type { ApiError } from "@platform/ui/types/api-error";

/**
 * A failed triage call — an `ApiError` (so it is `baseApi`'s error type) with what the screen needs.
 * `status` undefined = never reached the server; `data` is the parsed body. `detail` is the server's
 * machine-readable detail string when it sent one; `fields` names the story fields a 422 complained about.
 */
export interface TriageApiError extends ApiError {
  detail: string | null;
  fields: string[];
  retryAfterSeconds: number | null;
}
