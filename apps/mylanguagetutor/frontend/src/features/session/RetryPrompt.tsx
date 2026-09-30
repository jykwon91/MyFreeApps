import { Button } from "@platform/ui";

interface RetryPromptProps {
  prompt: string;
  /** Disabled while a turn is in flight. */
  disabled: boolean;
  onTry: () => void;
  onSkip: () => void;
}

/** The tutor invites the learner to say a corrected sentence again. Always skippable. */
export default function RetryPrompt({ prompt, disabled, onTry, onSkip }: RetryPromptProps) {
  return (
    <div className="rounded-md border border-dashed px-3 py-2 text-sm">
      <p>{prompt}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" onClick={onTry} disabled={disabled}>
          Try it
        </Button>
        <Button variant="ghost" size="sm" onClick={onSkip} className="min-h-[44px]">
          Skip
        </Button>
      </div>
    </div>
  );
}
