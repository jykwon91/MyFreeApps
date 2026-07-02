import { type KeyboardEvent } from "react";
import { RefreshCw, SendHorizontal } from "lucide-react";
import { Button } from "@platform/ui";

interface SuggestionComposerProps {
  value: string;
  onChange: (s: string) => void;
  onSend: () => void;
  /** Blank reroll — regenerate without a note (old "Another option"). */
  onRegenerate: () => void;
  /** Any suggestion-card mutation in flight. The textarea goes
   *  readOnly (NOT disabled — disabling blurs the focused control and
   *  focus wouldn't return after send). */
  isBusy: boolean;
  /** True when the assistant asked a clarifying question — the same
   *  input answers it, only the placeholder changes. */
  isClarify: boolean;
}

// Always-visible chat input under the suggestion card. Everything the
// user types here — style nudges ("no em dashes"), clarify answers,
// redirections — routes to the same request_alternative hint endpoint.
export default function SuggestionComposer({
  value,
  onChange,
  onSend,
  onRegenerate,
  isBusy,
  isClarify,
}: SuggestionComposerProps) {
  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== "Enter" || e.shiftKey) return;
    e.preventDefault();
    if (isBusy || !value.trim()) return;
    onSend();
  }

  const placeholder = isClarify
    ? "Type your answer…"
    : "Tell me what to change — e.g. 'no em dashes', 'more concise'";

  return (
    <div className="space-y-2 border-t border-border pt-3">
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        rows={2}
        readOnly={isBusy}
        aria-label="Message the assistant"
        placeholder={placeholder}
        className={`w-full rounded-md border border-border bg-background p-2 text-sm ${
          isBusy ? "opacity-60" : ""
        }`}
      />
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] text-muted-foreground">
          Enter to send · Shift+Enter for a new line
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={onRegenerate}
            disabled={isBusy}
            aria-label="Try another take without a note"
          >
            <RefreshCw size={14} />
          </Button>
          <Button
            size="sm"
            onClick={onSend}
            disabled={isBusy || !value.trim()}
            aria-label="Send"
          >
            <span className="inline-flex items-center gap-1.5">
              <SendHorizontal size={14} /> Send
            </span>
          </Button>
        </div>
      </div>
    </div>
  );
}
