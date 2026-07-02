import { Pencil } from "lucide-react";
import InlineText from "@/features/resume_refinement/InlineText";

interface DraftLineProps {
  /** Raw markdown line content (bullet marker already stripped) —
   *  sent verbatim so the backend's substring replace still matches. */
  text: string;
  /** Nearest preceding ## heading — the new target's section label. */
  section: string;
  disabled: boolean;
  onSelect: (payload: { text: string; section: string }) => void;
}

/**
 * A clickable draft block: click to create (or jump to) an improvement
 * target for this line. Native button for free keyboard + SR semantics.
 * The trailing pencil renders at low opacity always (the only discovery
 * affordance on touch) and intensifies on hover.
 */
export default function DraftLine({ text, section, disabled, onSelect }: DraftLineProps) {
  const plain = text.replace(/\*\*?/g, "").trim();

  function handleClick() {
    // Users drag-select bullets to copy them constantly — a click at
    // the end of a selection drag is not a "get suggestion" gesture.
    if (window.getSelection()?.toString()) return;
    onSelect({ text, section });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      title="Get a suggestion for this line"
      aria-label={`Get a suggestion for this line: ${plain}`}
      className="group w-full text-left rounded-sm cursor-pointer hover:bg-muted/60 hover:ring-1 hover:ring-border disabled:opacity-40 disabled:cursor-not-allowed"
    >
      <InlineText source={text} />
      <Pencil
        size={12}
        aria-hidden="true"
        className="inline-block ml-1.5 align-baseline text-muted-foreground/40 group-hover:text-muted-foreground"
      />
    </button>
  );
}
