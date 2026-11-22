import { VOICE_COPY } from "../constants/voiceCopy";
import type { ComposerView } from "../types/session/composer-view";
import type { VoicePhase } from "../types/session/voice-phase";

/**
 * What screen readers are told as the spoken loop moves on, on the website and the phone: that the
 * answer went off once listening ends. Not while listening (the microphone would hear it), and not over
 * the tutor's voice; the finished reply is announced on its own (`latestReply`).
 */
export function phaseAnnouncement(phase: VoicePhase, view: ComposerView): string | undefined {
  return view === "voice" && phase === "waiting" ? VOICE_COPY.micLabels.waiting : undefined;
}
