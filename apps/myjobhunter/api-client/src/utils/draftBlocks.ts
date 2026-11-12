import type { DraftBlock } from "../types/resume-refinement/draft-block";
import type { DraftLine } from "../types/resume-refinement/draft-line";
import { draftLineMatches } from "./draftLineMatches";
import { plainDraftText } from "./plainDraftText";

const HEADINGS = [
  { prefix: "# ", level: 1 },
  { prefix: "## ", level: 2 },
  { prefix: "### ", level: 3 },
] as const;

/**
 * The draft as blocks to draw. Handles only the subset the backend's render and rewrite pipeline
 * emits: headings, bullet lists, **bold**, *italic* and paragraphs; the PDF and DOCX downloads are
 * the canonical rendering. A block holding `highlightText` is marked. With `canPick`, bullets and
 * paragraphs after the first ## heading can be picked; those before it are the name and contact
 * preamble, facts that never look actionable, and the highlighted block is already the target.
 */
export function draftBlocks(source: string, highlightText: string | null | undefined, canPick: boolean): DraftBlock[] {
  const blocks: DraftBlock[] = [];
  let list: DraftLine[] = [];
  let section = "";
  let seenFirstSection = false;

  function line(text: string, pickable: boolean): DraftLine {
    const highlight = draftLineMatches(text, highlightText);
    return { text, highlight, pickable: pickable && seenFirstSection && canPick && !highlight, section };
  }

  function flushList(): void {
    if (list.length > 0) {
      blocks.push({ kind: "list", items: list });
      list = [];
    }
  }

  for (const raw of source.split("\n")) {
    const text = raw.replace(/\s+$/, "");
    if (text.startsWith("- ")) {
      list.push(line(text.slice(2), true));
      continue;
    }
    flushList();
    if (!text) continue;

    const heading = HEADINGS.find(({ prefix }) => text.startsWith(prefix));
    if (heading) {
      const content = text.slice(heading.prefix.length);
      if (heading.level === 2) {
        section = plainDraftText(content);
        seenFirstSection = true;
      }
      blocks.push({ kind: "heading", level: heading.level, line: line(content, false) });
      continue;
    }
    blocks.push({ kind: "paragraph", line: line(text, true) });
  }
  flushList();
  return blocks;
}
