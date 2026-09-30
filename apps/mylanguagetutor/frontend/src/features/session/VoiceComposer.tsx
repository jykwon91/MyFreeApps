import MicButton from "@/features/session/MicButton";
import type { RecognitionFailure } from "@/types/speech/recognition-failure";
import type { VoicePhase } from "@/types/session/voice-phase";

interface VoiceComposerProps {
  phase: VoicePhase;
  interim: string;
  failure: RecognitionFailure | null;
  micDisabled: boolean;
  onStart: () => void;
  onStop: () => void;
  onTypeInstead: () => void;
}

const FAILURE_HINT: Record<Exclude<RecognitionFailure, "denied">, string> = {
  no_speech: "Didn't catch anything. Tap the microphone and try again.",
  unavailable: "Speech recognition isn't working right now. You can type instead.",
};

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
  const hint = failure && failure !== "denied" ? FAILURE_HINT[failure] : null;
  return (
    <div className="flex flex-col items-center gap-3">
      {phase === "listening" && (
        <p className="min-h-[1.5rem] text-center text-sm italic text-muted-foreground" aria-live="polite">
          {interim || "Listening…"}
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
        Type instead
      </button>
    </div>
  );
}
