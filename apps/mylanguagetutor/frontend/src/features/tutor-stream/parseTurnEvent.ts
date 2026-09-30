import type { CorrectionsPayload, TurnFinalStatus, TurnStreamEvent } from "@/types/tutor/turn-events";

type Json = Record<string, unknown>;

function asObject(data: string): Json | null {
  if (!data) return {};
  try {
    const value: unknown = JSON.parse(data);
    return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Json) : null;
  } catch {
    return null;
  }
}

const FINAL_STATUSES: readonly TurnFinalStatus[] = ["complete", "partial", "failed"];

function isFinalStatus(value: unknown): value is TurnFinalStatus {
  return typeof value === "string" && (FINAL_STATUSES as readonly string[]).includes(value);
}

function toCorrections(body: Json): CorrectionsPayload | null {
  const state = body.scenario_state as Json | undefined;
  if (!Array.isArray(body.items) || !state || !Array.isArray(state.goals_met)) return null;
  return {
    items: body.items as CorrectionsPayload["items"],
    retry_prompt: typeof body.retry_prompt === "string" ? body.retry_prompt : null,
    scenario_state: {
      goals_met: state.goals_met.filter((g): g is number => typeof g === "number"),
      complete: state.complete === true,
    },
    translation: typeof body.translation === "string" ? body.translation : null,
  };
}

/**
 * One SSE message (``event:`` name + ``data:`` JSON) -> a typed turn event.
 * Unknown events and malformed payloads return null and are ignored, so a
 * newer backend can add events without breaking an older bundle.
 */
export function parseTurnEvent(name: string | undefined, data: string): TurnStreamEvent | null {
  const body = asObject(data);
  if (body === null) return null;
  switch (name) {
    case "turn.started":
      return typeof body.turn_id === "string" && typeof body.seq === "number"
        ? { type: "turn.started", turnId: body.turn_id, seq: body.seq }
        : null;
    case "reply.delta":
      return typeof body.text === "string" ? { type: "reply.delta", text: body.text } : null;
    case "reply.done":
      return { type: "reply.done" };
    case "corrections": {
      const payload = toCorrections(body);
      return payload ? { type: "corrections", payload } : null;
    }
    case "error":
      return {
        type: "error",
        code: typeof body.code === "string" ? body.code : "tutor_busy",
        retryable: body.retryable !== false,
      };
    case "done": {
      const usage = body.usage as Json | undefined;
      const remaining = typeof usage?.remaining_fraction === "number" ? usage.remaining_fraction : 1;
      return isFinalStatus(body.status)
        ? { type: "done", status: body.status, remainingFraction: remaining }
        : null;
    }
    default:
      return null;
  }
}
