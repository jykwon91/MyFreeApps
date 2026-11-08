import type { ASK_LIVE } from "@/games/wow-forever/data/ask/askLiveStates";

export type AskLiveState = (typeof ASK_LIVE)[keyof typeof ASK_LIVE];
