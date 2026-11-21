import type { TurnEventHandler } from "./turn-event-handler";

/** One learner turn to POST, and where its streamed events go. */
export interface StreamTurnOptions {
  sessionId: string;
  text: string;
  onEvent: TurnEventHandler;
  /** Called whenever any of the stream arrives, keep-alives included: the connection is still alive. */
  onData?: () => void;
  signal?: AbortSignal;
}
