/**
 * PasteTextStep — step-1 fallback panel for pasting raw JD text.
 *
 * Used when the operator doesn't have a URL (e.g. LinkedIn auth-walled
 * postings, copy-pasted email job descriptions).
 */
import { LoadingButton } from "@platform/ui";
import type { DialogInputMode } from "../useAddApplicationDialogState";

interface PasteTextStepProps {
  textValue: string;
  onTextChange: (next: string) => void;
  onTextSubmit: () => void;
  onSetInputMode: (mode: DialogInputMode) => void;
}

export default function PasteTextStep({
  textValue,
  onTextChange,
  onTextSubmit,
  onSetInputMode,
}: PasteTextStepProps) {
  const canSubmit = textValue.trim().length > 0;

  return (
    <div className="space-y-3">
      <label htmlFor="add-app-text" className="block text-sm font-medium">
        Paste the job description text
      </label>
      <textarea
        id="add-app-text"
        value={textValue}
        onChange={(e) => onTextChange(e.target.value)}
        rows={8}
        placeholder="Paste the full job description here…"
        aria-label="Job description text"
        autoFocus
        className="w-full border rounded-md px-3 py-2 text-sm bg-background resize-y"
      />
      <div className="flex justify-end">
        <LoadingButton
          type="button"
          isLoading={false}
          loadingText="Parsing…"
          disabled={!canSubmit}
          onClick={onTextSubmit}
        >
          Parse with AI
        </LoadingButton>
      </div>
      <div className="flex flex-col gap-1 pt-2 border-t">
        <button
          type="button"
          onClick={() => onSetInputMode("url")}
          className="text-xs underline text-muted-foreground hover:text-foreground self-start"
        >
          Have a URL instead? Paste it here.
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
