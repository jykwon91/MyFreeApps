import { useEffect, useRef, useState } from "react";
import { Check, Share2 } from "lucide-react";
import { showSuccess } from "@platform/ui";
import { COPIED_RESET_MS } from "@/games/wow-forever/data/worldMap/mapMarks";

interface ShareViewButtonProps {
  /** Builds the link when it's asked for, so it always carries the view as it is now. */
  makeUrl: () => string;
}

/**
 * "Share this view": copies a link that opens this map at this zoom, with these
 * layers, marks and route. Where the clipboard is refused the link is shown
 * selected in a box to copy by hand.
 */
export default function ShareViewButton({ makeUrl }: ShareViewButtonProps) {
  const [copied, setCopied] = useState(false);
  const [fallback, setFallback] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => window.clearTimeout(timer.current), []);
  useEffect(() => {
    if (fallback) inputRef.current?.select();
  }, [fallback]);

  async function share() {
    const url = makeUrl();
    window.clearTimeout(timer.current);
    try {
      await navigator.clipboard.writeText(url);
      setFallback(null);
      setCopied(true);
      showSuccess("Link copied — anyone who opens it sees this map, its marks and route.");
      timer.current = window.setTimeout(() => setCopied(false), COPIED_RESET_MS);
    } catch {
      setFallback(url);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={share}
        className="inline-flex items-center gap-1.5 rounded-md border px-3 text-sm min-h-[44px] sm:min-h-[36px] hover:bg-muted/40"
      >
        {copied ? <Check aria-hidden className="h-4 w-4 text-green-600" /> : <Share2 aria-hidden className="h-4 w-4" />}
        <span aria-live="polite">{copied ? "Copied" : "Share this view"}</span>
      </button>
      {fallback && (
        <label className="flex min-w-0 flex-1 basis-full items-center gap-2 text-xs">
          <span className="shrink-0">Copy this link:</span>
          <input
            ref={inputRef}
            readOnly
            value={fallback}
            onFocus={(e) => e.currentTarget.select()}
            className="min-w-0 flex-1 rounded-md border bg-background px-2 text-xs min-h-[44px] sm:min-h-[32px]"
          />
        </label>
      )}
    </div>
  );
}
