import type { CorrectionItem } from "@/types/tutor/correction";
import type { ScenarioState } from "@/types/tutor/scenario-state";

/**
 * SSE events of ``POST /sessions/{id}/turns``. Mirrors
 * ``app/schemas/tutor/turn_schemas.py`` -- change together.
 *
 * Order: turn.started, reply.delta*, reply.done, corrections, done
 *    or: turn.started, reply.delta*, error, done
 */
export type TurnErrorCode = "tutor_busy" | "tutor_misconfigured" | "tutor_input_rejected";

export type TurnFinalStatus = "complete" | "partial" | "failed";

export interface CorrectionsPayload {
  items: CorrectionItem[];
  retry_prompt: string | null;
  scenario_state: ScenarioState;
  translation: string | null;
}

export type TurnStreamEvent =
  | { type: "turn.started"; turnId: string; seq: number }
  | { type: "reply.delta"; text: string }
  | { type: "reply.done" }
  | { type: "corrections"; payload: CorrectionsPayload }
  | { type: "error"; code: TurnErrorCode | string; retryable: boolean }
  | { type: "done"; status: TurnFinalStatus; remainingFraction: number };
