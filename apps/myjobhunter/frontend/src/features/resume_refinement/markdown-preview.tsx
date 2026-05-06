import { useEffect, useRef } from "react";

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

interface InlineSpan {
  text: string;
  bold?: boolean;
  italic?: boolean;
}

interface MarkdownPreviewProps {
  source: string;
  highlightText?: string | null;
}

function renderInline(line: string): InlineSpan[] {
  const spans: InlineSpan[] = [];
  let i = 0;
  let buffer = "";

  while (i < line.length) {
    if (line[i] === "*" && line[i + 1] === "*") {
      const end = line.indexOf("**", i + 2);
      if (end >= 0) {
        if (buffer) {
          spans.push({ text: buffer });
          buffer = "";
        }
        spans.push({ text: line.slice(i + 2, end), bold: true });
        i = end + 2;
        continue;
      }
    } else if (line[i] === "*") {
      const end = line.indexOf("*", i + 1);
      if (end >= 0 && line[end + 1] !== "*") {
        if (buffer) {
          spans.push({ text: buffer });
          buffer = "";
        }
        spans.push({ text: line.slice(i + 1, end), italic: true });
        i = end + 1;
        continue;
      }
    }
    buffer += line[i];
    i += 1;
  }

  if (buffer) {
    spans.push({ text: buffer });
  }
  return spans;
}

function InlineText({ source }: { source: string }) {
  const spans = renderInline(source);
  return (
    <>
      {spans.map((span, idx) => {
        if (span.bold && span.italic) return <strong key={idx}><em>{span.text}</em></strong>;
        if (span.bold) return <strong key={idx}>{span.text}</strong>;
        if (span.italic) return <em key={idx}>{span.text}</em>;
        return <span key={idx}>{span.text}</span>;
      })}
    </>
  );
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

export default function MarkdownPreview({ source, highlightText }: MarkdownPreviewProps) {
  const lines = source.split("\n");
  const blocks: React.ReactNode[] = [];
  let listBuffer: { text: string; highlight: boolean }[] = [];
  let key = 0;
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
              <InlineText source={item.text} />
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
      listBuffer.push({ text, highlight: shouldHighlight(text, highlightText) });
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
        </h1>
      );
      continue;
    }
    if (line.startsWith("## ")) {
      const text = line.slice(3);
      const hl = shouldHighlight(text, highlightText);
      blocks.push(
        <h2
          key={`h-${key++}`}
          ref={(node) => attachIfFirst(node, hl)}
          className={`text-base font-bold uppercase tracking-wide mt-4 ${hl ? HIGHLIGHT_CLASS : ""}`}
        >
          <InlineText source={text} />
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
        </h3>
      );
      continue;
    }

    const hl = shouldHighlight(line, highlightText);
    blocks.push(
      <p
        key={`p-${key++}`}
        ref={(node) => attachIfFirst(node, hl)}
        className={`text-sm ${hl ? HIGHLIGHT_CLASS : ""}`}
      >
        <InlineText source={line} />
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
