import type { TRIAGE_STATUS_FILTERS } from "@/games/wow-forever/data/featureRequests/triage/triageEnums";

/** A chip on the All requests tab. */
export type TriageStatusFilter = (typeof TRIAGE_STATUS_FILTERS)[number];
