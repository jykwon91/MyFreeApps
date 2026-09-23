import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { Check, Copy } from "lucide-react";

const COPY_STATE = { idle: "idle", copied: "copied", failed: "failed" } as const;
type CopyState = (typeof COPY_STATE)[keyof typeof COPY_STATE];

const RESET_MS = 2000;

interface CopyButtonProps {
  text: string;
  label: string;
  /** Screen-reader / tooltip detail, e.g. the command being copied. */
  title?: string;
}

/** Copies `text` to the clipboard and says so. */
export default function CopyButton({ text, label, title }: CopyButtonProps) {
  const [state, setState] = useState<CopyState>(COPY_STATE.idle);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  async function copy() {
    window.clearTimeout(timer.current);
    try {
      await navigator.clipboard.writeText(text);
      setState(COPY_STATE.copied);
    } catch {
      setState(COPY_STATE.failed);
    }
    timer.current = window.setTimeout(() => setState(COPY_STATE.idle), RESET_MS);
  }

  const shown: Record<CopyState, string> = { idle: label, copied: "Copied", failed: "Copy failed — select the text" };
  return (
    <button
      type="button"
      onClick={copy}
      title={title ?? text}
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-md border px-2.5 text-xs min-h-[44px] sm:min-h-[32px] transition-colors hover:bg-muted/40",
        state === COPY_STATE.copied && "border-green-500 text-green-700 dark:text-green-300",
      )}
    >
      {state === COPY_STATE.copied ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
      <span aria-live="polite">{shown[state]}</span>
    </button>
  );
}
