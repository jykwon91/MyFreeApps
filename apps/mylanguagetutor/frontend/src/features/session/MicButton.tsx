import { Mic, Square } from "lucide-react";
import { cn } from "@platform/ui";
import type { VoicePhase } from "@/types/session/voice-phase";

interface MicButtonProps {
  phase: VoicePhase;
  /** A request is in flight: the button stays visible but can't be pressed. */
  disabled: boolean;
  onStart: () => void;
  onStop: () => void;
}

const LABELS: Record<VoicePhase, string> = {
  idle: "Tap to speak",
  listening: "Tap when you're done",
  waiting: "Waiting for the tutor",
  replying: "The tutor is answering",
  speaking: "Tap to interrupt and speak",
};

/**
 * The one big control of the practice screen. Tapping while the tutor is
 * speaking interrupts it (barge-in). Disabled -- never hidden -- while a turn
 * is in flight, so the layout doesn't jump.
 */
export default function MicButton({ phase, disabled, onStart, onStop }: MicButtonProps) {
  const listening = phase === "listening";
  const label = LABELS[phase];
  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={listening ? onStop : onStart}
        disabled={disabled}
        aria-label={label}
        aria-pressed={listening}
        className={cn(
          "flex h-16 w-16 min-h-[44px] min-w-[44px] items-center justify-center rounded-full shadow-sm transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
          "disabled:cursor-not-allowed disabled:opacity-50",
          listening ? "bg-red-600 text-white animate-pulse" : "bg-primary text-primary-foreground hover:opacity-90",
        )}
      >
        {listening ? <Square className="h-6 w-6" aria-hidden="true" /> : <Mic className="h-7 w-7" aria-hidden="true" />}
      </button>
      <span className="text-xs text-muted-foreground" aria-live="polite">
        {label}
      </span>
    </div>
  );
}
