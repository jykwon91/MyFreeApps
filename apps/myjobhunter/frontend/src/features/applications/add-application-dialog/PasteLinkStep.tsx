/**
 * PasteLinkStep — step-1 URL-paste panel (the default input mode).
 *
 * Behaviour:
 * - Autofocuses on mount so the operator can paste immediately.
 * - Paste-and-go: pasting a complete https?:// URL fires the extract
 *   without a button click.
 * - Enter key on a non-empty field also fires.
 * - Two escape links lead to the text-paste and manual-entry panels.
 */
import { useEffect, useRef } from "react";
import { LoadingButton } from "@platform/ui";
import type { DialogInputMode } from "../useAddApplicationDialogState";

interface PasteLinkStepProps {
  urlValue: string;
  onUrlChange: (next: string) => void;
  onUrlPaste: (e: React.ClipboardEvent<HTMLInputElement>) => void;
  onUrlSubmit: () => void;
  onSetInputMode: (mode: DialogInputMode) => void;
}

export default function PasteLinkStep({
  urlValue,
  onUrlChange,
  onUrlPaste,
  onUrlSubmit,
  onSetInputMode,
}: PasteLinkStepProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const canSubmit = urlValue.trim().length > 0;

  return (
    <div className="space-y-3">
      <label htmlFor="add-app-url" className="block text-sm font-medium">
        Job posting URL — paste to auto-fill
      </label>
      <input
        id="add-app-url"
        ref={inputRef}
        type="url"
        value={urlValue}
        onChange={(e) => onUrlChange(e.target.value)}
        onPaste={onUrlPaste}
        onKeyDown={(e) => {
          if (e.key === "Enter" && canSubmit) {
            e.preventDefault();
            onUrlSubmit();
          }
        }}
        placeholder="https://jobs.example.com/posting/abc"
        aria-label="Job posting URL"
        className="w-full border rounded-md px-3 py-2 text-sm bg-background"
      />
      <div className="flex justify-end">
        <LoadingButton
          type="button"
          isLoading={false}
          loadingText="Reading…"
          disabled={!canSubmit}
          onClick={onUrlSubmit}
        >
          Auto-fill
        </LoadingButton>
      </div>
      <div className="flex flex-col gap-1 pt-2 border-t">
        <button
          type="button"
          onClick={() => onSetInputMode("text")}
          className="text-xs underline text-muted-foreground hover:text-foreground self-start"
        >
          No URL? Paste the description text instead.
        </button>
        <button
          type="button"
          onClick={() => onSetInputMode("company-name")}
          className="text-xs underline text-muted-foreground hover:text-foreground self-start"
        >
          Adding manually? Type a company name.
        </button>
      </div>
    </div>
  );
}
