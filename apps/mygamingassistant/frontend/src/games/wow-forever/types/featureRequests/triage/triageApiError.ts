/**
 * A failed triage call. `status` null = never reached the server (or no key). `detail` is the server's
 * machine-readable detail string when it sent one; `fields` names the story fields a 422 complained about.
 */
export interface TriageApiError {
  status: number | null;
  detail: string | null;
  fields: string[];
  retryAfterSeconds: number | null;
}
