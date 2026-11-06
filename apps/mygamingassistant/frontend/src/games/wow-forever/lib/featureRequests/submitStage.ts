import { SUBMIT_STAGE, SUBMIT_STAGE_AT_MS } from "@/games/wow-forever/data/featureRequests/suggestCopy";
import type { SubmitStage } from "@/games/wow-forever/types/featureRequests/submitStage";

/** The status line to show `elapsedMs` after the idea was sent. */
export function submitStageAt(elapsedMs: number): SubmitStage {
  let stage: SubmitStage = SUBMIT_STAGE.reading;
  for (const step of SUBMIT_STAGE_AT_MS) {
    if (elapsedMs >= step.at) stage = step.stage;
  }
  return stage;
}
