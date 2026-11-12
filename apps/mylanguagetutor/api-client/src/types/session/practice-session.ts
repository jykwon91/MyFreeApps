import type { ScenarioState } from "../tutor/scenario-state";
import type { RequestPhase } from "./request-phase";
import type { SessionBlock } from "./session-block";
import type { TranscriptEntry } from "./transcript-entry";
import type { TurnFailure } from "./turn-failure";

export interface PracticeSession {
  sessionId: string | null;
  entries: TranscriptEntry[];
  requestPhase: RequestPhase;
  failure: TurnFailure | null;
  block: SessionBlock | null;
  scenarioState: ScenarioState;
  send: (text: string) => void;
  retry: () => void;
  dismissFailure: () => void;
  dismissRetryPrompt: (key: string) => void;
}
