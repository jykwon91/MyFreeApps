import { useState } from "react";
import { X } from "lucide-react";

const DISMISS_KEY = "mjh:resumeRefinementClickTipDismissed";

/**
 * One-time dismissible discovery tip for click-to-target. Also states
 * the fact-vs-phrasing boundary up front so users don't discover it by
 * bouncing off the hallucination guard.
 */
export default function ClickToTargetTip() {
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem(DISMISS_KEY) === "1",
  );
  if (dismissed) return null;

  return (
    <div className="flex items-start gap-2 rounded-md border border-border bg-muted/40 px-2.5 py-1.5 text-xs text-muted-foreground">
      <p className="flex-1">
        Tip: click any line to get a fresh suggestion for it. To fix a wrong
        fact (title, dates, employer), edit it on your Profile page — I can
        only adjust phrasing.
      </p>
      <button
        type="button"
        aria-label="Dismiss tip"
        onClick={() => {
          localStorage.setItem(DISMISS_KEY, "1");
          setDismissed(true);
        }}
        className="shrink-0 hover:text-foreground"
      >
        <X size={14} />
      </button>
    </div>
  );
}
