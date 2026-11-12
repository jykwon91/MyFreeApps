import type { VoicePhase } from "../types/session/voice-phase";

/**
 * Whether a finished reply may be played again. Never while the microphone is open: the tutor's voice
 * would be heard by the recognizer and sent as the learner's answer. Barge-in (tapping the microphone)
 * already stops a replay that is playing, so this only has to refuse the other direction.
 */
export function canReplay(phase: VoicePhase): boolean {
  return phase !== "listening";
}
