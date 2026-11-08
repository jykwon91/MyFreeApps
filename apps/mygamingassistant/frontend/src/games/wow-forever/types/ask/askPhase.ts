import type { ASK_PHASE } from "@/games/wow-forever/data/ask/askPhases";

export type AskPhase = (typeof ASK_PHASE)[keyof typeof ASK_PHASE];
