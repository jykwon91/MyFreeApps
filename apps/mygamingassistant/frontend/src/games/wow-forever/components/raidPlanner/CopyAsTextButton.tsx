import { Button, showSuccess } from "@platform/ui";
import { Copy } from "lucide-react";
import { useId, useState } from "react";
import { PLANNER_MESSAGE } from "@/games/wow-forever/data/raidPlanner";

interface CopyAsTextButtonProps {
  /** "G1: Bob, Alice", a line per group. */
  text: string;
  disabled: boolean;
}

/**
 * [Copy as text]: the groups for a raid's chat. Where the browser blocks the clipboard — a page that isn't HTTPS, or an
 * iframe that may not write it — the text appears below instead, selected, to copy by hand.
 */
export default function CopyAsTextButton({ text, disabled }: CopyAsTextButtonProps) {
  const [blocked, setBlocked] = useState(false);
  const fallbackId = useId();
  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      setBlocked(true);
      return;
    }
    setBlocked(false);
    showSuccess(PLANNER_MESSAGE.COPIED);
  };
  return (
    <>
      <Button variant="secondary" className="gap-2" disabled={disabled} onClick={() => void copy()}>
        <Copy aria-hidden className="h-4 w-4" />
        Copy as text
      </Button>
      {blocked && (
        <div className="order-last basis-full space-y-1">
          <label htmlFor={fallbackId} className="block text-sm">
            {PLANNER_MESSAGE.COPY_BLOCKED}
          </label>
          <textarea
            id={fallbackId}
            readOnly
            value={text}
            rows={text.split("\n").length}
            autoFocus
            onFocus={(event) => event.currentTarget.select()}
            onBlur={() => setBlocked(false)}
            className="w-full resize-none rounded-md border bg-card p-2 font-mono text-sm text-foreground"
          />
        </div>
      )}
    </>
  );
}
