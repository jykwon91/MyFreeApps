import type { VoicePhase } from "../types/session/voice-phase";
import type { VoicePhaseInputs } from "../types/session/voice-phase-inputs";

/**
 * One phase for the whole loop, from the three independent sources
 * (microphone, network request, speech output). A request in flight wins
 * over speech: the reply is still arriving even if the first sentence is
 * already being read aloud.
 */
export function voicePhase({ listening, requestPhase, speaking }: VoicePhaseInputs): VoicePhase {
  if (listening) return "listening";
  if (requestPhase !== "idle") return requestPhase;
  if (speaking) return "speaking";
  return "idle";
}
