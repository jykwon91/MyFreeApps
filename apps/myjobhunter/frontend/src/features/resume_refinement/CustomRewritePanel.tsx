import { type KeyboardEvent } from "react";
import { Button, LoadingButton } from "@platform/ui";

interface CustomRewritePanelProps {
  customText: string;
  onChange: (s: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
  isPending: boolean;
}

export default function CustomRewritePanel({
  customText,
  onChange,
  onCancel,
  onSubmit,
  isPending,
}: CustomRewritePanelProps) {
  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== "Enter" || e.shiftKey) return;
    e.preventDefault();
    if (isPending || !customText.trim()) return;
    onSubmit();
  }

  return (
    <div className="space-y-2 border-t border-border pt-3">
      <textarea
        value={customText}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        rows={3}
        // autoFocus: this panel opens on an explicit "Write my own"
        // click, and the always-visible composer below is a second
        // textarea — focusing here makes it obvious which input is live.
        autoFocus
        aria-label="Your rewrite of this section"
        placeholder="Type the version you want… Enter to send, Shift+Enter for newline."
        className="w-full rounded-md border border-border bg-background p-2 text-sm"
      />
      <div className="flex gap-2 justify-end">
        <Button
          variant="secondary"
          size="sm"
          onClick={onCancel}
          disabled={isPending}
        >
          Cancel
        </Button>
        <LoadingButton
          isLoading={isPending}
          onClick={onSubmit}
          disabled={!customText.trim()}
        >
          Use my version
        </LoadingButton>
      </div>
    </div>
  );
}
