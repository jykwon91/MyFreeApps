import type { ScenarioState } from "../tutor/scenario-state";
import type { PracticeNotice } from "./practice-notice";
import type { RequestPhase } from "./request-phase";
import type { SessionBlock } from "./session-block";
import type { TranscriptEntry } from "./transcript-entry";
import type { TurnFailure } from "./turn-failure";

export interface PracticeSession {
  sessionId: string | null;
  entries: TranscriptEntry[];
  requestPhase: RequestPhase;
  /** A turn is in flight: ``requestPhase`` isn't idle. */
  busy: boolean;
  failure: TurnFailure | null;
  /**
   * Why no turn can be sent now, from today's usage or a refusal; null when the learner can go on.
   * A daily-limit block lifts once usage fetched after the daily reset shows budget again.
   */
  block: SessionBlock | null;
  scenarioState: ScenarioState;
  /**
   * Something to tell the learner that isn't a failure: their answer was shortened to fit, or the
   * conversation restarted after the server lost it (its goals start over; earlier turns stay in the
   * transcript). Replaced by the next turn's own notice, or cleared by it.
   */
  notice: PracticeNotice | null;
  send: (text: string) => void;
  retry: () => void;
  /**
   * Stops the turn in flight as if the connection dropped (the phone going to the background):
   * the reply so far stays, and "Try again" sends the same words. Once the whole reply has arrived
   * the turn is left to finish: the server has already counted it.
   */
  interrupt: () => void;
  /**
   * The conversation is back from where ``interrupt`` last ran (the phone back from the background).
   * The turn in flight then, if its whole reply has arrived and it is still waiting, keeps waiting
   * while its stream keeps sending, since the server finishes the turn either way. Once nothing has
   * arrived for ``RESUMED_TURN_SILENCE_MS`` its connection is taken to have died while the phone was
   * away: it ends complete, its corrections marked missing. Any other turn, such as one sent since,
   * is left alone.
   */
  resume: () => void;
  /** Reads ``text`` aloud again from the start, slowly when ``slow``, over anything still being spoken. */
  replay: (text: string, slow: boolean) => void;
  dismissFailure: () => void;
  dismissNotice: () => void;
  dismissRetryPrompt: (key: string) => void;
}
