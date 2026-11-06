import type { TRIAGE_SHEET_KINDS } from "@/games/wow-forever/data/featureRequests/triage/triageEnums";

/** Which sheet is open; each is its own URL param carrying the story id. */
export type TriageSheetKind = (typeof TRIAGE_SHEET_KINDS)[number];
