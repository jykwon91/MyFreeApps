import type { ASK_FAILURE } from "@/games/wow-forever/data/ask/askFailureKinds";

export type AskFailureKind = (typeof ASK_FAILURE)[keyof typeof ASK_FAILURE];
