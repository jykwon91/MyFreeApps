/**
 * Single-page input panel for /analyze.
 *
 * Two modes — URL (default) and pasted text — with the same paste-and-go
 * affordance as the Add Application dialog: pasting a string starting
 * with `http(s)://` into the URL input fires the analysis immediately
 * without the operator clicking a button.
 *
 * Why not extract from AddApplicationDialog?
 * ------------------------------------------
 * The dialog's input panel is tangled with the dialog's three-step
 * state machine, dialog open/close lifecycle, and submit-time fallback
 * for failed company auto-creates. Pulling out a clean shared component
 * is its own refactor — not blocking this feature. Logged in the PR
 * description for follow-up.
 *
 * The input shape itself IS small (one URL, one textarea, one mode
 * toggle, one paste-and-go handler) so the duplication is bounded
 * and the test surface is small.
 */
import { useEffect, useRef } from "react";
import { LoadingButton } from "@platform/ui";

const URL_REGEX = /^https?:\/\/\S+$/i;

export type AnalyzeInputMode = "url" | "text";

export interface AnalyzeJdInputProps {
  mode: AnalyzeInputMode;
  urlValue: string;
  textValue: string;
  isSubmitting: boolean;
  onChangeMode: (mode: AnalyzeInputMode) => void;
  onChangeUrl: (next: string) => void;
  onChangeText: (next: string) => void;
  onSubmitUrl: () => void;
  onSubmitText: () => void;
  onPasteUrl: (pasted: string) => void;
}

export default function AnalyzeJdInput(props: AnalyzeJdInputProps) {
  if (props.mode === "url") {
    return <UrlPanel {...props} />;
  }
  return <TextPanel {...props} />;
}

function UrlPanel({
  urlValue,
  isSubmitting,
  onChangeMode,
  onChangeUrl,
  onSubmitUrl,
  onPasteUrl,
}: AnalyzeJdInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const canSubmit = !isSubmitting && urlValue.trim().length > 0;

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const pasted = e.clipboardData.getData("text").trim();
    if (URL_REGEX.test(pasted)) {
      e.preventDefault();
      onPasteUrl(pasted);
    }
  }

  return (
    <div className="space-y-3">
      <label htmlFor="analyze-url" className="block text-sm font-medium">
        Paste a job posting URL
      </label>
      <input
        id="analyze-url"
        ref={inputRef}
        type="url"
        value={urlValue}
        onChange={(e) => onChangeUrl(e.target.value)}
        onPaste={handlePaste}
        onKeyDown={(e) => {
          if (e.key === "Enter" && canSubmit) {
            e.preventDefault();
            onSubmitUrl();
          }
        }}
        placeholder="https://jobs.example.com/posting/abc"
        aria-label="Job posting URL"
        disabled={isSubmitting}
        className="w-full border rounded-md px-3 py-2 text-sm bg-background"
      />
      <div className="flex justify-end">
        <LoadingButton
          type="button"
          isLoading={isSubmitting}
          loadingText="Analyzing…"
          disabled={!canSubmit}
          onClick={onSubmitUrl}
        >
          Analyze this job
        </LoadingButton>
      </div>
      <div className="pt-2 border-t">
        <button
          type="button"
          onClick={() => onChangeMode("text")}
          className="text-xs underline text-muted-foreground hover:text-foreground"
        >
          No URL? Paste the description text instead.
        </button>
      </div>
    </div>
  );
}

function TextPanel({
  textValue,
  isSubmitting,
  onChangeMode,
  onChangeText,
  onSubmitText,
}: AnalyzeJdInputProps) {
  const canSubmit = !isSubmitting && textValue.trim().length > 0;
  return (
    <div className="space-y-3">
      <label htmlFor="analyze-text" className="block text-sm font-medium">
        Paste the job description text
      </label>
      <textarea
        id="analyze-text"
        value={textValue}
        onChange={(e) => onChangeText(e.target.value)}
        rows={10}
        placeholder="Paste the full job description here…"
        aria-label="Job description text"
        autoFocus
        disabled={isSubmitting}
        className="w-full border rounded-md px-3 py-2 text-sm bg-background resize-y"
      />
      <div className="flex justify-end">
        <LoadingButton
          type="button"
          isLoading={isSubmitting}
          loadingText="Analyzing…"
          disabled={!canSubmit}
          onClick={onSubmitText}
        >
          Analyze this job
        </LoadingButton>
      </div>
      <div className="pt-2 border-t">
        <button
          type="button"
          onClick={() => onChangeMode("url")}
          className="text-xs underline text-muted-foreground hover:text-foreground"
        >
          Have a URL? Paste it instead — we'll fetch the page for you.
        </button>
      </div>
    </div>
  );
}
