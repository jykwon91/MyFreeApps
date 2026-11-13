/**
 * Turn answers as app/api/turns.py streams them: turn.started, reply.delta*,
 * reply.done, corrections, done -- or turn.started, reply.delta*, error, done.
 * Payloads follow app/schemas/tutor/turn_schemas.py. The stub puts
 * turn.started in front, since only it knows the turn's id and seq.
 */
import type { CompleteTurnOptions } from "../types/CompleteTurnOptions";
import type { SseEvent } from "../types/SseEvent";
import type { TurnRefusal } from "../types/TurnRefusal";
import type { TurnStream } from "../types/TurnStream";

const DEFAULT_REMAINING = 0.8;

/** The SSE body for these events, framed as the server writes them. */
export function sseBody(events: SseEvent[]): string {
  return events.map(({ event, data }) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`).join("");
}

/** The reply as it streams: one reply.delta per word, so the client has to join them. The server never sends an empty one. */
function deltas(reply: string): SseEvent[] {
  return reply
    .split(/(?<= )/)
    .filter((text) => text !== "")
    .map((text) => ({ event: "reply.delta", data: { text } }));
}

function done(status: "complete" | "partial" | "failed", remainingFraction = DEFAULT_REMAINING): SseEvent {
  return { event: "done", data: { status, usage: { remaining_fraction: remainingFraction } } };
}

/** A turn the tutor answered in full, with its corrections. */
export function completeTurn({
  reply,
  translation = null,
  corrections = [],
  retryPrompt = null,
  goalsMet = [],
  complete = false,
  remainingFraction,
}: CompleteTurnOptions): TurnStream {
  return {
    kind: "stream",
    events: [
      ...deltas(reply),
      { event: "reply.done", data: {} },
      {
        event: "corrections",
        data: { items: corrections, retry_prompt: retryPrompt, scenario_state: { goals_met: goalsMet, complete }, translation },
      },
      done("complete", remainingFraction),
    ],
  };
}

/** The tutor failed after starting its reply: what arrived, then error and done (partial). */
export function failedMidReply(partialReply: string, code: string, retryable: boolean): TurnStream {
  return {
    kind: "stream",
    events: [...deltas(partialReply), { event: "error", data: { code, retryable } }, done("partial")],
  };
}

/** The tutor failed before any reply text: error, then done (failed). The server saves no reply, so the turn isn't counted. */
export function failedBeforeReply(code: string, retryable: boolean): TurnStream {
  return { kind: "stream", events: [{ event: "error", data: { code, retryable } }, done("failed")] };
}

/** The connection dropped after the whole reply but before corrections and done. */
export function cutAfterReply(reply: string): TurnStream {
  return { kind: "stream", events: [...deltas(reply), { event: "reply.done", data: {} }] };
}

/** A turn refused before the stream opens. */
export function refusedTurn(status: number, detail: string): TurnRefusal {
  return { kind: "refusal", status, detail };
}
