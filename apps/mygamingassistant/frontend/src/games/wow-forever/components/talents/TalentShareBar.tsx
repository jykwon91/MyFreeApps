import { useEffect, useRef, useState } from "react";
import { Check, Link2, RotateCcw } from "lucide-react";
import { showSuccess } from "@platform/ui";
import { TALENT_COPIED_RESET_MS } from "@/games/wow-forever/data/talents/talentConfig";
import { shareOrigin } from "@/games/wow-forever/lib/shareOrigin";

interface TalentShareBarProps {
  /** Nothing to reset when no point is spent. */
  canReset: boolean;
  onReset: () => void;
}

/**
 * "Copy link" (the address already holds the build, so the link is this page)
 * and "Reset". Where the clipboard is refused the link is shown selected to
 * copy by hand.
 */
export default function TalentShareBar({ canReset, onReset }: TalentShareBarProps) {
  const [copied, setCopied] = useState(false);
  const [fallback, setFallback] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => window.clearTimeout(timer.current), []);
  useEffect(() => {
    if (fallback) inputRef.current?.select();
  }, [fallback]);

  async function copy() {
    const url = `${shareOrigin()}${window.location.pathname}${window.location.search}`;
    window.clearTimeout(timer.current);
    try {
      await navigator.clipboard.writeText(url);
      setFallback(null);
      setCopied(true);
      showSuccess("Link copied — anyone who opens it sees this build.");
      timer.current = window.setTimeout(() => setCopied(false), TALENT_COPIED_RESET_MS);
    } catch {
      setFallback(url);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={copy}
        data-testid="talent-copy-link"
        className="inline-flex items-center gap-1.5 rounded-md border px-3 text-sm min-h-[44px] hover:bg-muted/40"
      >
        {copied ? <Check aria-hidden className="h-4 w-4 text-green-600" /> : <Link2 aria-hidden className="h-4 w-4" />}
        <span aria-live="polite">{copied ? "Copied" : "Copy link"}</span>
      </button>
      <button
        type="button"
        onClick={onReset}
        disabled={!canReset}
        className="inline-flex items-center gap-1.5 rounded-md border px-3 text-sm min-h-[44px] hover:bg-muted/40 disabled:opacity-40"
      >
        <RotateCcw aria-hidden className="h-4 w-4" />
        Reset
      </button>
      {fallback ? (
        <label className="flex min-w-0 flex-1 basis-full items-center gap-2 text-xs">
          <span className="shrink-0">Copy this link:</span>
          <input
            ref={inputRef}
            readOnly
            value={fallback}
            onFocus={(e) => e.currentTarget.select()}
            className="min-w-0 flex-1 rounded-md border bg-background px-2 text-xs min-h-[44px]"
          />
        </label>
      ) : null}
    </div>
  );
}
