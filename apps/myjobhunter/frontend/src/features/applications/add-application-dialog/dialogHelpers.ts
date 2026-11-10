/**
 * dialogHelpers — the browser's half of turning an extracted job description
 * into the notes scaffold. The shared rules (line breaks, folding, the notes
 * limit) live in @myjobhunter/api-client; this file only supplies the HTML
 * and URL parsers, which are the browser's own.
 */
import { combineNotes as combineExtractNotes } from "@myjobhunter/api-client/utils/combineNotes";
import { htmlToPlainText } from "@myjobhunter/api-client/utils/htmlToPlainText";
import type { JdUrlExtractResponse } from "@myjobhunter/api-client/types/application/jd-url-extract-response";

export function combineNotes(result: JdUrlExtractResponse): string | null {
  return combineExtractNotes(result, domTextContent);
}

/**
 * Convert an HTML fragment to plain text.
 *
 * Parsing is delegated to the browser's own HTML parser via `DOMParser`
 * rather than a chain of regex replacements. A regex chain gets this class of
 * job wrong in two ways a real parser cannot:
 *
 * - **Order-dependent entity decoding.** Stripping tags before decoding
 *   entities leaves `&lt;script&gt;` intact through the strip, then turns it
 *   into `<script>` afterwards — the sanitiser hands back the exact markup it
 *   was meant to remove.
 * - **Double unescaping.** Running `&amp;` -> `&` as one replacement and
 *   `&lt;` -> `<` as another means `&amp;lt;` decodes twice and yields `<`,
 *   again reconstructing markup from an already-escaped input.
 *
 * The result is used as plain text (the notes scaffold) and must never be fed
 * to `dangerouslySetInnerHTML` — see NotesSection.
 */
export function stripHtml(html: string): string {
  return htmlToPlainText(html, domTextContent);
}

/**
 * `DOMParser.parseFromString(html, "text/html")` builds an inert document:
 * scripts do not execute and no subresources are fetched. `textContent` then
 * yields the text with every tag removed and every entity decoded exactly
 * once, per the HTML spec.
 */
export function domTextContent(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  // Script/style bodies are markup internals, not prose — their text would
  // otherwise survive into the notes.
  doc.body
    ?.querySelectorAll("script, style, noscript, template")
    .forEach((el) => el.remove());
  return doc.body?.textContent ?? "";
}

/** The browser's URL parser, for reducing a company website to its domain. */
export function urlHostname(url: string): string {
  return new URL(url).hostname;
}
