/** Waiting for Undo, being sent, or waiting out a 429 before it's sent again. */
export type DelayedActionPhase = "waiting" | "running" | "retrying";
