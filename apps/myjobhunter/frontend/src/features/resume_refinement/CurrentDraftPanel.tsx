import MarkdownPreview from "@/features/resume_refinement/markdown-preview";

interface CurrentDraftPanelProps {
  markdown: string;
  /** When set, the matching block in the preview gets a yellow band + auto-scroll. */
  highlightText?: string | null;
}

/**
 * Resume-preview pane.
 *
 * Designed to live inside ``ActiveSessionLayout``'s left column,
 * which sets a fixed height + ``min-h-0``. We fill that height
 * with ``flex-1`` and let the inner block own the scroll. The
 * outer ``section`` gets ``flex flex-col`` so the inner scroll
 * region (the rendered markdown) shrinks to fit and scrolls
 * internally — the operator always sees the full resume while
 * working through suggestions on the right.
 */
export default function CurrentDraftPanel({ markdown, highlightText }: CurrentDraftPanelProps) {
  return (
    <section className="rounded-lg border border-border bg-card p-4 flex flex-col min-h-0 flex-1 gap-2">
      <header className="shrink-0">
        <h2 className="text-sm font-semibold">Current draft</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Your live working copy.{" "}
          {highlightText
            ? "The highlighted line is what we're refining now."
            : "Changes apply as you accept rewrites."}
        </p>
      </header>
      <div className="rounded-md border border-border bg-background p-4 overflow-y-auto flex-1 min-h-0">
        {markdown.trim() ? (
          <MarkdownPreview source={markdown} highlightText={highlightText} />
        ) : (
          <p className="text-sm text-muted-foreground">Your draft is empty.</p>
        )}
      </div>
    </section>
  );
}
