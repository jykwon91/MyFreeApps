import type { VoicePhase } from "../types/session/voice-phase";

/**
 * Whether a finished reply may be played again. Not while the microphone is open: the tutor's voice
 * would be heard by the recognizer and sent as the learner's answer. Not while a turn is in flight
 * either: a replay shares one speech queue with the reply that is arriving, so it would cut off the
 * sentences already queued for it. Barge-in (tapping the microphone) already stops a replay that is
 * playing, and "speaking" only follows a finished stream, so replacing that playback is intended.
 */
export function canReplay(phase: VoicePhase): boolean {
  return phase === "idle" || phase === "speaking";
}
