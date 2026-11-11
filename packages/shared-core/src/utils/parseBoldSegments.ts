import type { BoldSegment } from "../types/text/bold-segment";

const BOLD_PATTERN = /\*\*(.+?)\*\*/g;

/**
 * Splits a string at its **bold** runs, for the website and the phone to render the same way.
 * Only bold is understood; an unbalanced `**` stays as plain text.
 */
export function parseBoldSegments(text: string): BoldSegment[] {
  const segments: BoldSegment[] = [];
  let last = 0;
  for (const match of text.matchAll(BOLD_PATTERN)) {
    const index = match.index ?? 0;
    if (index > last) segments.push({ text: text.slice(last, index), bold: false });
    segments.push({ text: match[1] ?? "", bold: true });
    last = index + match[0].length;
  }
  if (last < text.length) segments.push({ text: text.slice(last), bold: false });
  return segments;
}
