import { useCallback, useState } from "react";
import type { InputMode } from "../types/session/input-mode";
import type { VoiceInput } from "../types/session/voice-input";
import type { VoiceInputConfig } from "../types/session/voice-input-config";
import { canReplay } from "../utils/canReplay";
import { composerView } from "../utils/composerView";
import { voicePhase } from "../utils/voicePhase";

/**
 * Speaking or typing an answer, on the website and the phone: the phase of the loop, what the bottom of
 * the screen shows, and the learner's moves. The microphone stays off while a turn is in flight; tapping
 * it while the tutor is still speaking interrupts the tutor (barge-in). Where recognition isn't
 * supported, the learner types.
 */
export function useVoiceInput({
  recognition,
  speaking,
  stopSpeaking,
  requestPhase,
  block,
  privacyAcked,
  ackPrivacy,
}: VoiceInputConfig): VoiceInput {
  const [mode, setMode] = useState<InputMode>(recognition.supported ? "voice" : "text");
  const busy = requestPhase !== "idle";
  const phase = voicePhase({ listening: recognition.listening, requestPhase, speaking });
  const { start, stop, clearFailure } = recognition;

  const startListening = useCallback(() => {
    if (block || busy) return;
    stopSpeaking();
    start();
  }, [block, busy, start, stopSpeaking]);

  const acceptPrivacy = useCallback(() => {
    ackPrivacy();
    startListening();
  }, [ackPrivacy, startListening]);

  const switchToText = useCallback(() => {
    stop();
    clearFailure();
    setMode("text");
  }, [clearFailure, stop]);

  const switchToVoice = useCallback(() => setMode("voice"), []);

  return {
    mode,
    phase,
    canReplay: canReplay(phase),
    view: composerView({ blocked: block !== null, mode, failure: recognition.failure, privacyAcked }),
    startListening,
    acceptPrivacy,
    switchToText,
    switchToVoice,
  };
}
