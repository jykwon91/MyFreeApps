import { useEffect, useRef } from "react";
import { draftBlocks } from "@myjobhunter/api-client/utils/draftBlocks";
import type { DraftLine as DraftLineModel } from "@myjobhunter/api-client/types/resume-refinement/draft-line";
import InlineText from "@/features/resume_refinement/InlineText";
import DraftLine from "@/features/resume_refinement/DraftLine";

// Tiny in-page markdown preview of the draft. The parsing (draftBlocks, shared with the phone)
// handles only the constrained subset the backend's render/rewrite pipeline emits; the canonical
// rendering is the PDF / DOCX export, which uses pandoc + weasyprint.
//
// `highlightText`: any block whose plain text contains it gets a highlight band, and the first one
// becomes the auto-scroll target so users see where the active refinement target lives.
//
// `onLineClick`: when provided, bullets and paragraphs after the first ## heading become clickable
// (user-directed targeting). The currently-highlighted block is never clickable.

interface MarkdownPreviewProps {
  source: string;
  highlightText?: string | null;
  onLineClick?: (payload: { text: string; section: string }) => void;
  clickDisabled?: boolean;
}

const HIGHLIGHT_CLASS =
  "rounded-md border-l-4 border-amber-400 bg-amber-50/60 dark:bg-amber-500/10 -ml-2 pl-3 py-1";

const HEADING_CLASS = {
  1: "text-xl font-bold border-b border-border pb-1",
  2: "text-base font-bold uppercase tracking-wide mt-4",
  3: "text-sm font-bold mt-2",
} as const;

// Screen-reader marker for the amber band — the highlight is otherwise color-only.
function activeMarker(highlight: boolean): React.ReactNode {
  if (!highlight) return null;
  return <span className="sr-only">(this is the suggestion you're working on)</span>;
}

export default function MarkdownPreview({
  source,
  highlightText,
  onLineClick,
  clickDisabled = false,
}: MarkdownPreviewProps) {
  const blocks = draftBlocks(source, highlightText, !!onLineClick);
  const firstHighlightRef = useRef<HTMLElement | null>(null);
  let firstHighlightAssigned = false;

  // Capture-callback: assigns the first matching DOM node to the ref so the effect below can
  // scroll to it whenever the highlight target changes.
  function attachIfFirst(node: HTMLElement | null, isHighlight: boolean) {
    if (!isHighlight || !node || firstHighlightAssigned) return;
    firstHighlightAssigned = true;
    firstHighlightRef.current = node;
  }

  function content(line: DraftLineModel): React.ReactNode {
    if (line.pickable && onLineClick) {
      return (
        <DraftLine
          text={line.text}
          section={line.section}
          disabled={clickDisabled}
          onSelect={onLineClick}
        />
      );
    }
    return <InlineText source={line.text} />;
  }

  // Auto-scroll the matched block into view whenever the target changes.
  useEffect(() => {
    const node = firstHighlightRef.current;
    if (node) {
      node.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [highlightText]);

  return (
    <div className="space-y-1.5">
      {blocks.map((block, index) => {
        if (block.kind === "list") {
          return (
            <ul key={`ul-${index}`} className="list-disc pl-5 space-y-1 text-sm">
              {block.items.map((item, idx) => (
                <li
                  key={idx}
                  ref={(node) => attachIfFirst(node, item.highlight)}
                  className={item.highlight ? HIGHLIGHT_CLASS : undefined}
                >
                  {content(item)}
                  {activeMarker(item.highlight)}
                </li>
              ))}
            </ul>
          );
        }
        const { line } = block;
        const highlight = line.highlight ? HIGHLIGHT_CLASS : "";
        if (block.kind === "heading") {
          const Heading = `h${block.level}` as const;
          return (
            <Heading
              key={`h-${index}`}
              ref={(node: HTMLHeadingElement | null) => attachIfFirst(node, line.highlight)}
              className={`${HEADING_CLASS[block.level]} ${highlight}`}
            >
              <InlineText source={line.text} />
              {activeMarker(line.highlight)}
            </Heading>
          );
        }
        return (
          <p
            key={`p-${index}`}
            ref={(node) => attachIfFirst(node, line.highlight)}
            className={`text-sm ${highlight}`}
          >
            {content(line)}
            {activeMarker(line.highlight)}
          </p>
        );
      })}
    </div>
  );
}
