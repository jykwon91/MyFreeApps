import type { TriageHttpMethod } from "@/games/wow-forever/types/featureRequests/triage/triageHttpMethod";

/** One call to the triage API, relative to `/api/wow/feature-requests/triage`. */
export interface TriageRequestArgs {
  path: string;
  method: TriageHttpMethod;
  body?: unknown;
  /** The story's `updated_at`, sent as `If-Match` (PATCH and merge). */
  ifMatch?: string;
  /** A key to try instead of the stored one — only the unlock form's check. Never locks on failure. */
  candidateKey?: string;
}
