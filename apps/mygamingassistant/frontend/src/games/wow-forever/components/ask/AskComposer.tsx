import { useId, type FormEvent, type KeyboardEvent } from "react";
import { LoadingButton } from "@platform/ui";
import { ASK_COPY } from "@/games/wow-forever/data/ask/askCopy";
import { ASK_LIMITS } from "@/games/wow-forever/data/ask/askLimits";

interface AskComposerProps {
  value: string;
  onChange: (text: string) => void;
  onSend: (text: string) => void;
  busy: boolean;
  /** No sending at all (chat full); typing still works. */
  disabled: boolean;
}

/** The question box: Enter sends, Shift+Enter is a new line (never mid-IME), with a character counter. */
export default function AskComposer({ value, onChange, onSend, busy, disabled }: AskComposerProps) {
  const inputId = useId();
  const counterId = useId();
  const canSend = !busy && !disabled && value.trim() !== "";

  function send(event?: FormEvent) {
    event?.preventDefault();
    if (canSend) onSend(value);
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    send();
  }

  return (
    <form onSubmit={send} className="space-y-2" data-section="composer">
      <label htmlFor={inputId} className="sr-only">
        {ASK_COPY.composerLabel}
      </label>
      <textarea
        id={inputId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        maxLength={ASK_LIMITS.questionMaxChars}
        rows={2}
        placeholder={ASK_COPY.composerPlaceholder}
        aria-describedby={counterId}
        className="w-full resize-y rounded-md border bg-background px-3 py-2 text-base sm:text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      <div className="flex items-center justify-between gap-2">
        <span id={counterId} className="text-xs text-muted-foreground">
          {ASK_COPY.counter(value.length)}
        </span>
        <LoadingButton type="submit" isLoading={busy} loadingText={ASK_COPY.sending} disabled={!canSend}>
          {ASK_COPY.send}
        </LoadingButton>
      </div>
    </form>
  );
}
