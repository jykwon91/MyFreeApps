import type { ASK_TOOL } from "@/games/wow-forever/data/ask/askTools";

/** A tool the page runs for Claude — the same names as the backend's `TOOL_NAMES`. */
export type AskToolName = (typeof ASK_TOOL)[keyof typeof ASK_TOOL];
