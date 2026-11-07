import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { Check, Link as LinkIcon } from "lucide-react";
import { showError, showSuccess } from "@platform/ui";
import { shareOrigin } from "@/games/wow-forever/lib/shareOrigin";
import { bisListShareUrl, toSharedBisList } from "@/games/wow-forever/lib/bisLists/bisListShareUrl";
import type { SharedBisList } from "@/games/wow-forever/types/bisLists/sharedBisList";

const RESET_MS = 2000;

/**
 * Copies a link that carries the whole list in its fragment. If the clipboard
 * is blocked (some browsers, the Discord Activity), the link is shown,
 * selected, so it can be copied by hand.
 */
export default function BisListCopyLinkButton({ list }: { list: SharedBisList }) {
  const [copied, setCopied] = useState(false);
  const [manualUrl, setManualUrl] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  async function copy() {
    window.clearTimeout(timer.current);
    const url = bisListShareUrl(shareOrigin(), toSharedBisList(list));
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      setCopied(false);
      setManualUrl(url);
      showError("Couldn't copy the link. Copy it from the box below the buttons.");
      return;
    }
    setManualUrl(null);
    setCopied(true);
    showSuccess(`Link to “${list.name}” copied — anyone with it can see the list`);
    timer.current = window.setTimeout(() => setCopied(false), RESET_MS);
  }

  return (
    <>
      <button
        type="button"
        onClick={copy}
        className={clsx(
          "inline-flex items-center justify-center gap-1.5 rounded-md border px-3 text-sm min-h-[44px] transition-colors hover:bg-muted/40",
          copied && "border-green-500 text-green-700 dark:text-green-300",
        )}
      >
        {copied ? <Check className="h-4 w-4" aria-hidden /> : <LinkIcon className="h-4 w-4" aria-hidden />}
        <span>{copied ? "Copied" : "Copy link"}</span>
      </button>
      {manualUrl ? (
        <label className="basis-full flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">Link to this list</span>
          <input
            readOnly
            value={manualUrl}
            onFocus={(e) => e.currentTarget.select()}
            autoFocus
            className="border rounded-md px-3 py-2 text-sm min-h-[44px] w-full bg-card"
          />
        </label>
      ) : null}
    </>
  );
}
