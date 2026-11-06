import type { TriageApiError } from "@/games/wow-forever/types/featureRequests/triage/triageApiError";

export type TriageResult<T> = { ok: true; data: T } | { ok: false; error: TriageApiError };
