import type { TurnEventHandler } from "./turn-event-handler";

/** One learner turn to POST, and where its streamed events go. */
export interface StreamTurnOptions {
  sessionId: string;
  text: string;
  onEvent: TurnEventHandler;
  signal?: AbortSignal;
}
