import type { HtmlTextContent } from "../types/application/html-text-content";

/**
 * Turns an HTML fragment into plain text, keeping the line breaks its block markup implies.
 * Parsing is left to `textContent`, a real HTML parser, never a chain of regex replacements:
 * one of those decodes entities in the wrong order or twice, and rebuilds markup from escaped
 * input. The result is plain text, for a text field; never render it as HTML.
 */
export function htmlToPlainText(html: string, textContent: HtmlTextContent): string {
  const withBreaks = html
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\s*\/?\s*(p|li|div|h[1-6])\b[^>]*>/gi, "\n");

  return (
    textContent(withBreaks)
      // A parsed &nbsp; is U+00A0, an invisible trap in an editable text field.
      .replace(/\u00a0/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}
