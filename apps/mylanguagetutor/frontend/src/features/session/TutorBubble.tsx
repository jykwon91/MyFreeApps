import { useState } from "react";
import { ChevronDown, ChevronUp, Turtle, Volume2 } from "lucide-react";
import { cn } from "@platform/ui";

interface TutorBubbleProps {
  text: string;
  translation: string | null;
  /** Cut off mid-reply (connection dropped / tutor failed after starting). */
  partial: boolean;
  /** No text-to-speech in this browser: hide the replay controls. */
  canSpeak: boolean;
  onReplay: () => void;
  onReplaySlow: () => void;
}

const ICON_BUTTON =
  "inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1 rounded-md px-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground";

/**
 * One tutor reply with replay (normal and slow -- a genuinely lower speaking
 * rate) and a collapsed English translation.
 */
export default function TutorBubble({
  text,
  translation,
  partial,
  canSpeak,
  onReplay,
  onReplaySlow,
}: TutorBubbleProps) {
  const [showTranslation, setShowTranslation] = useState(false);
  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] space-y-1">
        <p className="whitespace-pre-wrap break-words rounded-2xl rounded-bl-sm bg-muted px-4 py-2 text-sm">
          {text}
          {partial && <span className="text-muted-foreground"> …</span>}
        </p>
        {partial && (
          <p className="px-1 text-xs text-muted-foreground">The reply was cut off.</p>
        )}
        <div className="flex flex-wrap items-center">
          {canSpeak && (
            <>
              <button type="button" onClick={onReplay} className={ICON_BUTTON} aria-label="Play again">
                <Volume2 className="h-4 w-4" aria-hidden="true" />
                <span>Replay</span>
              </button>
              <button type="button" onClick={onReplaySlow} className={ICON_BUTTON} aria-label="Play again slowly">
                <Turtle className="h-4 w-4" aria-hidden="true" />
                <span>Slow</span>
              </button>
            </>
          )}
          {translation && (
            <button
              type="button"
              onClick={() => setShowTranslation((shown) => !shown)}
              className={ICON_BUTTON}
              aria-expanded={showTranslation}
            >
              {showTranslation ? (
                <ChevronUp className="h-4 w-4" aria-hidden="true" />
              ) : (
                <ChevronDown className="h-4 w-4" aria-hidden="true" />
              )}
              <span>{showTranslation ? "Hide translation" : "Show translation"}</span>
            </button>
          )}
        </div>
        {translation && (
          <p className={cn("px-1 text-sm text-muted-foreground", !showTranslation && "hidden")}>
            {translation}
          </p>
        )}
      </div>
    </div>
  );
}
