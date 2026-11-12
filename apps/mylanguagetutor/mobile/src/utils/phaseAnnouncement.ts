import { VOICE_COPY } from "@mylanguagetutor/api-client/constants/voiceCopy";
import type { ComposerView } from "@mylanguagetutor/api-client/types/session/composer-view";
import type { VoicePhase } from "@mylanguagetutor/api-client/types/session/voice-phase";

/**
 * What screen readers are told as the spoken loop moves on: that the answer went off once listening
 * ends. Not while listening (the microphone would hear it), and not over the tutor's voice; the finished
 * reply is announced on its own.
 */
export function phaseAnnouncement(phase: VoicePhase, view: ComposerView): string | undefined {
  return view === "voice" && phase === "waiting" ? VOICE_COPY.micLabels.waiting : undefined;
}
