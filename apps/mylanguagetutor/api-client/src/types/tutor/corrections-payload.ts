import type { CorrectionItem } from "./correction-item";
import type { ScenarioState } from "./scenario-state";

/** Body of the ``corrections`` SSE event. */
export interface CorrectionsPayload {
  items: CorrectionItem[];
  retry_prompt: string | null;
  scenario_state: ScenarioState;
  translation: string | null;
}
