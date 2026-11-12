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
  /**
   * Stops the turn in flight as if the connection dropped (the phone going to the background):
   * the reply so far stays, and "Try again" sends the same words. Once the whole reply has arrived
   * the turn is left to finish: the server has already counted it.
   */
  interrupt: () => void;
  /**
   * Stops waiting on the turn that was in flight at the last ``interrupt``, if its whole reply has
   * arrived and it is still waiting, as when its connection may have died while the phone was in
   * the background: it ends complete, its corrections marked missing. Any other turn, such as one
   * sent since, is left alone.
   */
  stopWaitingForCorrections: () => void;
  dismissFailure: () => void;
  dismissRetryPrompt: (key: string) => void;
}
