/**
 * dialogHelpers — pure utility functions for the AddApplicationDialog flow.
 *
 * All functions here are stateless and have no React dependencies.
 * They are extracted from useAddApplicationFlow to keep the hook focused
 * on state transitions and async logic.
 */
import type { Company } from "@/types/company";
import type { ReviewCompanyState } from "../useAddApplicationDialogState";
import type { JdUrlExtractResponse } from "@/types/application/jd-url-extract-response";

const NOTES_MAX_LEN = 5000;

export function findCompanyByName(companies: Company[], name: string): Company | undefined {
  const trimmed = name.trim().toLowerCase();
  return companies.find((c) => c.name.trim().toLowerCase() === trimmed);
}

export function readCompanyId(company: ReviewCompanyState): string | null {
  if (company.kind === "tracked" || company.kind === "new") return company.companyId;
  if (company.kind === "manual") return company.companyId;
  return null;
}

/**
 * Reduce a company website URL to its bare host (no scheme, no leading
 * "www.", no trailing slash). The Company model's `primary_domain` is a
 * domain string, not a URL.
 */
export function websiteToDomain(website: string | null | undefined): string | null {
  if (!website) return null;
  try {
    const url = new URL(website.trim());
    let host = url.hostname.toLowerCase();
    if (host.startsWith("www.")) host = host.slice(4);
    return host || null;
  } catch {
    const stripped = website.trim().replace(/^https?:\/\//i, "").replace(/\/$/, "");
    return stripped.replace(/^www\./i, "") || null;
  }
}

export function combineNotes(result: JdUrlExtractResponse): string | null {
  const chunks: string[] = [];
  if (result.summary) chunks.push(result.summary);
  if (result.description_html) {
    const stripped = stripHtml(result.description_html).trim();
    if (stripped) chunks.push(stripped);
  }
  if (result.requirements_text) chunks.push(result.requirements_text);
  if (chunks.length === 0) return null;
  const combined = chunks.join("\n\n");
  return combined.length > NOTES_MAX_LEN ? combined.slice(0, NOTES_MAX_LEN) : combined;
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
 * `DOMParser.parseFromString(html, "text/html")` builds an inert document:
 * scripts do not execute and no subresources are fetched. `textContent` then
 * yields the text with every tag removed and every entity decoded exactly
 * once, per the HTML spec.
 *
 * The result is used as plain text (the notes scaffold) and must never be fed
 * to `dangerouslySetInnerHTML` — see NotesSection.
 */
export function stripHtml(html: string): string {
  // Preserve the line structure block-level markup implies, before the parser
  // flattens everything to text.
  const withBreaks = html
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\s*\/?\s*(p|li|div|h[1-6])\b[^>]*>/gi, "\n");

  const doc = new DOMParser().parseFromString(withBreaks, "text/html");
  // Script/style bodies are markup internals, not prose — their text would
  // otherwise survive into the notes.
  doc.body
    ?.querySelectorAll("script, style, noscript, template")
    .forEach((el) => el.remove());

  return (doc.body?.textContent ?? "")
    // The parser decodes `&nbsp;` to U+00A0. Notes are plain text edited in a
    // textarea, where a non-breaking space is an invisible foot-gun; fold it
    // back to an ordinary space.
    .replace(/\u00a0/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
