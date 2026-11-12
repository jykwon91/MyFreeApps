import { useId, useState } from "react";
import { ChevronDown, ChevronUp, Turtle, Volume2 } from "lucide-react";
import { cn } from "@platform/ui";
import { PRACTICE_COPY } from "@mylanguagetutor/api-client/constants/practiceCopy";

interface TutorBubbleProps {
  text: string;
  translation: string | null;
  /** Cut off mid-reply (connection dropped / tutor failed after starting). */
  partial: boolean;
  /** No text-to-speech in this browser: hide the replay controls. */
  canSpeak: boolean;
  /** False while the microphone is open: the buttons stay, disabled, and say why. */
  canReplay: boolean;
  onReplay: () => void;
  onReplaySlow: () => void;
}

const ICON_BUTTON =
  "inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1 rounded-md px-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-muted-foreground";

/**
 * One tutor reply with replay (normal and slow -- a genuinely lower speaking
 * rate) and a collapsed English translation.
 */
export default function TutorBubble({
  text,
  translation,
  partial,
  canSpeak,
  canReplay,
  onReplay,
  onReplaySlow,
}: TutorBubbleProps) {
  const [showTranslation, setShowTranslation] = useState(false);
  const replayHintId = useId();
  const replaySlowHintId = useId();
  const unavailableHintId = useId();
  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] space-y-1">
        <p className="whitespace-pre-wrap break-words rounded-2xl rounded-bl-sm bg-muted px-4 py-2 text-sm">
          {text}
          {partial && <span className="text-muted-foreground"> …</span>}
        </p>
        {partial && (
          <p className="px-1 text-xs text-muted-foreground">{PRACTICE_COPY.replyCutOff}</p>
        )}
        <div className="flex flex-wrap items-center">
          {canSpeak && (
            <>
              <button type="button" onClick={onReplay} disabled={!canReplay} className={ICON_BUTTON} aria-describedby={canReplay ? replayHintId : unavailableHintId}>
                <Volume2 className="h-4 w-4" aria-hidden="true" />
                <span>{PRACTICE_COPY.replay}</span>
              </button>
              <span id={replayHintId} hidden>
                {PRACTICE_COPY.replayHint}
              </span>
              <button type="button" onClick={onReplaySlow} disabled={!canReplay} className={ICON_BUTTON} aria-describedby={canReplay ? replaySlowHintId : unavailableHintId}>
                <Turtle className="h-4 w-4" aria-hidden="true" />
                <span>{PRACTICE_COPY.replaySlow}</span>
              </button>
              <span id={replaySlowHintId} hidden>
                {PRACTICE_COPY.replaySlowHint}
              </span>
              {/* Fixed text, hidden: the transcript is a live region, and a hint that changed would be read aloud
                  into the open microphone. The buttons only switch which hint describes them. */}
              <span id={unavailableHintId} hidden>
                {PRACTICE_COPY.replayUnavailableHint}
              </span>
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
              <span>{showTranslation ? PRACTICE_COPY.hideTranslation : PRACTICE_COPY.showTranslation}</span>
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
