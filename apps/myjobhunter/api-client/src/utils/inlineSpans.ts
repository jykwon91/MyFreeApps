import type { InlineSpan } from "../types/resume-refinement/inline-span";

/** One line of the draft's markdown subset (**bold**, *italic*, plain runs) as runs to draw. */
export function inlineSpans(line: string): InlineSpan[] {
  const spans: InlineSpan[] = [];
  let i = 0;
  let buffer = "";

  function flush(): void {
    if (buffer) {
      spans.push({ text: buffer });
      buffer = "";
    }
  }

  while (i < line.length) {
    if (line[i] === "*" && line[i + 1] === "*") {
      const end = line.indexOf("**", i + 2);
      if (end >= 0) {
        flush();
        spans.push({ text: line.slice(i + 2, end), bold: true });
        i = end + 2;
        continue;
      }
    } else if (line[i] === "*") {
      const end = line.indexOf("*", i + 1);
      if (end >= 0 && line[end + 1] !== "*") {
        flush();
        spans.push({ text: line.slice(i + 1, end), italic: true });
        i = end + 1;
        continue;
      }
    }
    buffer += line[i];
    i += 1;
  }

  flush();
  return spans;
}
