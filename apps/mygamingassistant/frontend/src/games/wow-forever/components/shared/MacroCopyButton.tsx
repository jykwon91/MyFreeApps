import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { Check, Copy } from "lucide-react";
import { showError, showSuccess } from "@platform/ui";

const RESET_MS = 2000;

interface MacroCopyButtonProps {
  text: string;
  /** The macro's title, for the accessible name and the toast. */
  title: string;
}

/** Copies a macro's text. The button changes at once and a toast says whether it worked. */
export default function MacroCopyButton({ text, title }: MacroCopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  async function copy() {
    window.clearTimeout(timer.current);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      setCopied(false);
      showError(`Couldn't copy "${title}". Select the text and copy it by hand.`);
      return;
    }
    setCopied(true);
    showSuccess(`Copied "${title}"`);
    timer.current = window.setTimeout(() => setCopied(false), RESET_MS);
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={`Copy macro: ${title}`}
      className={clsx(
        "inline-flex items-center justify-center gap-1.5 rounded-md border px-3 text-sm min-h-[44px] min-w-[44px] transition-colors hover:bg-muted/40",
        copied && "border-green-500 text-green-700 dark:text-green-300",
      )}
    >
      {copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
      <span>{copied ? "Copied" : "Copy"}</span>
    </button>
  );
}
