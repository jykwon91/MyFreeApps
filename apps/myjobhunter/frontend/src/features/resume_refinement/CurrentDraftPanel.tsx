import MarkdownPreview from "@/features/resume_refinement/markdown-preview";

interface CurrentDraftPanelProps {
  markdown: string;
  /** When set, the matching block in the preview gets a yellow band + auto-scroll. */
  highlightText?: string | null;
}

export default function CurrentDraftPanel({ markdown, highlightText }: CurrentDraftPanelProps) {
  return (
    <section className="rounded-lg border border-border bg-card p-4 space-y-2">
      <header>
        <h2 className="text-sm font-semibold">Current draft</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Your live working copy.{" "}
          {highlightText
            ? "The highlighted line is what we're refining now."
            : "Changes apply as you accept rewrites."}
        </p>
      </header>
      {/* Fill the visible viewport on desktop so the operator always
          sees the full resume while iterating on the suggestion card.
          ``calc(100dvh - 12rem)`` reserves room for the AppShell
          header (3.5rem) + page top padding (1-2rem) + this section's
          own header / padding (~3rem). ``dvh`` follows mobile-browser
          chrome so the panel never gets buried under a slide-up
          toolbar. The inner block keeps its own ``overflow-y-auto``
          so a long resume scrolls inside the panel rather than
          pushing the page. */}
      <div className="rounded-md border border-border bg-background p-4 overflow-y-auto max-h-[calc(100dvh-12rem)]">
        {markdown.trim() ? (
          <MarkdownPreview source={markdown} highlightText={highlightText} />
        ) : (
          <p className="text-sm text-muted-foreground">Your draft is empty.</p>
        )}
      </div>
    </section>
  );
}
