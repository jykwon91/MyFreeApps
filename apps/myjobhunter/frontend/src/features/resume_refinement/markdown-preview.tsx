import { useEffect, useRef } from "react";
import InlineText from "@/features/resume_refinement/InlineText";
import DraftLine from "@/features/resume_refinement/DraftLine";

// Tiny in-page markdown preview. Handles only the constrained subset
// emitted by the backend's render/rewrite pipeline (headings, bullet
// lists, **bold**, *italic*, paragraphs). For the canonical rendering
// users export to PDF / DOCX which uses pandoc + weasyprint.
//
// `highlightText`: when provided, any block (heading / paragraph /
// list-item) whose plain text contains this substring is wrapped in a
// highlight band. The first matching block becomes the auto-scroll
// target so users immediately see where the active refinement target
// lives in the full draft.
//
// `onLineClick`: when provided, bullet and paragraph blocks AFTER the
// first ## heading become clickable (user-directed targeting). Blocks
// before the first section heading are name/contact preamble — pure
// facts that should never look actionable. The currently-highlighted
// block is never clickable (it's already the active target).

interface MarkdownPreviewProps {
  source: string;
  highlightText?: string | null;
  onLineClick?: (payload: { text: string; section: string }) => void;
  clickDisabled?: boolean;
}

// Strip markdown decoration so a heading like "**Staff Engineer** — Acme"
// matches a target_current_text of "Staff Engineer — Acme".
function plainText(line: string): string {
  return line.replace(/\*\*?/g, "").trim();
}

function shouldHighlight(line: string, highlightText: string | null | undefined): boolean {
  if (!highlightText) return false;
  const needle = highlightText.trim();
  if (!needle) return false;
  return plainText(line).includes(needle) || line.trim().includes(needle);
}

const HIGHLIGHT_CLASS =
  "rounded-md border-l-4 border-amber-400 bg-amber-50/60 dark:bg-amber-500/10 -ml-2 pl-3 py-1";

// Screen-reader marker for the amber band — the highlight is otherwise
// color-only.
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
  const lines = source.split("\n");
  const blocks: React.ReactNode[] = [];
  let listBuffer: { text: string; highlight: boolean; clickable: boolean; section: string }[] = [];
  let key = 0;
  // Section tracking for click-to-target: the nearest preceding ##
  // heading labels the new target; blocks before the first ## are
  // never clickable.
  let currentSection = "";
  let seenFirstSection = false;
  const firstHighlightRef = useRef<HTMLElement | null>(null);
  let firstHighlightAssigned = false;

  // Capture-callback: assigns the first matching DOM node to the ref so
  // useEffect can scroll to it once, on every re-render where the
  // highlight target changes.
  function attachIfFirst(node: HTMLElement | null, isHighlight: boolean) {
    if (!isHighlight || !node || firstHighlightAssigned) return;
    firstHighlightAssigned = true;
    firstHighlightRef.current = node;
  }

  function flushList() {
    if (listBuffer.length > 0) {
      const items = [...listBuffer];
      blocks.push(
        <ul key={`ul-${key++}`} className="list-disc pl-5 space-y-1 text-sm">
          {items.map((item, idx) => (
            <li
              key={idx}
              ref={(node) => attachIfFirst(node, item.highlight)}
              className={item.highlight ? HIGHLIGHT_CLASS : undefined}
            >
              {item.clickable && onLineClick ? (
                <DraftLine
                  text={item.text}
                  section={item.section}
                  disabled={clickDisabled}
                  onSelect={onLineClick}
                />
              ) : (
                <InlineText source={item.text} />
              )}
              {activeMarker(item.highlight)}
            </li>
          ))}
        </ul>
      );
      listBuffer = [];
    }
  }

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, "");

    if (line.startsWith("- ")) {
      const text = line.slice(2);
      const hl = shouldHighlight(text, highlightText);
      listBuffer.push({
        text,
        highlight: hl,
        clickable: seenFirstSection && !!onLineClick && !hl,
        section: currentSection,
      });
      continue;
    }

    flushList();

    if (!line) continue;

    if (line.startsWith("# ")) {
      const text = line.slice(2);
      const hl = shouldHighlight(text, highlightText);
      blocks.push(
        <h1
          key={`h-${key++}`}
          ref={(node) => attachIfFirst(node, hl)}
          className={`text-xl font-bold border-b border-border pb-1 ${hl ? HIGHLIGHT_CLASS : ""}`}
        >
          <InlineText source={text} />
          {activeMarker(hl)}
        </h1>
      );
      continue;
    }
    if (line.startsWith("## ")) {
      const text = line.slice(3);
      currentSection = plainText(text);
      seenFirstSection = true;
      const hl = shouldHighlight(text, highlightText);
      blocks.push(
        <h2
          key={`h-${key++}`}
          ref={(node) => attachIfFirst(node, hl)}
          className={`text-base font-bold uppercase tracking-wide mt-4 ${hl ? HIGHLIGHT_CLASS : ""}`}
        >
          <InlineText source={text} />
          {activeMarker(hl)}
        </h2>
      );
      continue;
    }
    if (line.startsWith("### ")) {
      const text = line.slice(4);
      const hl = shouldHighlight(text, highlightText);
      blocks.push(
        <h3
          key={`h-${key++}`}
          ref={(node) => attachIfFirst(node, hl)}
          className={`text-sm font-bold mt-2 ${hl ? HIGHLIGHT_CLASS : ""}`}
        >
          <InlineText source={text} />
          {activeMarker(hl)}
        </h3>
      );
      continue;
    }

    const hl = shouldHighlight(line, highlightText);
    const clickable = seenFirstSection && !!onLineClick && !hl;
    blocks.push(
      <p
        key={`p-${key++}`}
        ref={(node) => attachIfFirst(node, hl)}
        className={`text-sm ${hl ? HIGHLIGHT_CLASS : ""}`}
      >
        {clickable && onLineClick ? (
          <DraftLine
            text={line}
            section={currentSection}
            disabled={clickDisabled}
            onSelect={onLineClick}
          />
        ) : (
          <InlineText source={line} />
        )}
        {activeMarker(hl)}
      </p>
    );
  }
  flushList();

  // Auto-scroll the matched block into view whenever the target changes.
  useEffect(() => {
    const node = firstHighlightRef.current;
    if (node) {
      node.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [highlightText]);

  return <div className="space-y-1.5">{blocks}</div>;
}
