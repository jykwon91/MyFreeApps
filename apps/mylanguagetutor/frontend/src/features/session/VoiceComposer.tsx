import MicButton from "@/features/session/MicButton";
import { VOICE_COPY } from "@mylanguagetutor/api-client/constants/voiceCopy";
import { recognitionFailureHint } from "@mylanguagetutor/api-client/utils/recognitionFailureHint";
import type { VoiceComposerProps } from "@/types/session/voice-composer-props";

/** Microphone control, the live transcript while listening, and a way to switch to typing. */
export default function VoiceComposer({
  phase,
  interim,
  failure,
  micDisabled,
  onStart,
  onStop,
  onTypeInstead,
}: VoiceComposerProps) {
  const hint = recognitionFailureHint(failure);
  return (
    <div className="flex flex-col items-center gap-3">
      {phase === "listening" && (
        <p className="min-h-[1.5rem] text-center text-sm italic text-muted-foreground" aria-live="polite">
          {interim || VOICE_COPY.listening}
        </p>
      )}
      {hint && (
        <p className="text-center text-sm text-muted-foreground" role="status">
          {hint}
        </p>
      )}
      <MicButton phase={phase} disabled={micDisabled} onStart={onStart} onStop={onStop} />
      <button
        type="button"
        onClick={onTypeInstead}
        className="min-h-[44px] px-2 text-xs text-muted-foreground underline"
      >
        {VOICE_COPY.typeInstead}
      </button>
    </div>
  );
}
