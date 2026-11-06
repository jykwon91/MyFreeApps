import type { TRIAGE_SORTS } from "@/games/wow-forever/data/featureRequests/triage/triageEnums";

export type TriageSort = (typeof TRIAGE_SORTS)[number];
