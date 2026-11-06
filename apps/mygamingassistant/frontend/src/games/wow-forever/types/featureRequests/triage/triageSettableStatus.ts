import type { TRIAGE_SETTABLE_STATUSES } from "@/games/wow-forever/data/featureRequests/triage/triageEnums";

/** A status triage may PATCH — anything but `duplicate` (only a merge makes that). */
export type TriageSettableStatus = (typeof TRIAGE_SETTABLE_STATUSES)[number];
