import type { CorrectionsPayload } from "./corrections-payload";
import type { TurnErrorCode } from "./turn-error-code";
import type { TurnFinalStatus } from "./turn-final-status";

/**
 * SSE events of ``POST /sessions/{id}/turns``. Mirrors
 * ``app/schemas/tutor/turn_schemas.py`` -- change together.
 *
 * Order: turn.started, reply.delta*, reply.done, corrections, done
 *    or: turn.started, reply.delta*, error, done
 */
export type TurnStreamEvent =
  | { type: "turn.started"; turnId: string; seq: number }
  | { type: "reply.delta"; text: string }
  | { type: "reply.done" }
  | { type: "corrections"; payload: CorrectionsPayload }
  | { type: "error"; code: TurnErrorCode | string; retryable: boolean }
  | { type: "done"; status: TurnFinalStatus; remainingFraction: number };
