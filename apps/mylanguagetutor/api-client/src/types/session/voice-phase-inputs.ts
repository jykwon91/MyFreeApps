import type { RequestPhase } from "./request-phase";

/** The three independent sources the conversation loop's phase is derived from. */
export interface VoicePhaseInputs {
  listening: boolean;
  requestPhase: RequestPhase;
  speaking: boolean;
}
