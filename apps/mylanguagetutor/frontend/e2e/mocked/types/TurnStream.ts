import type { SseEvent } from "./SseEvent";

/** A turn the server accepts: the SSE events its body carries, in order. */
export interface TurnStream {
  kind: "stream";
  events: SseEvent[];
}
