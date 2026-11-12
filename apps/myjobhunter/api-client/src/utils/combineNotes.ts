import { APPLICATION_NOTES_MAX_LENGTH } from "../constants/textFieldLimits";
import type { HtmlTextContent } from "../types/application/html-text-content";
import type { JdUrlExtractResponse } from "../types/application/jd-url-extract-response";
import { htmlToPlainText } from "./htmlToPlainText";
import { textLength } from "@platform/core/utils/textLength";

/** The notes a read link starts with: its summary, description and requirements, within the notes limit. */
export function combineNotes(result: JdUrlExtractResponse, textContent: HtmlTextContent): string | null {
  const chunks: string[] = [];
  if (result.summary) chunks.push(result.summary);
  if (result.description_html) {
    const stripped = htmlToPlainText(result.description_html, textContent).trim();
    if (stripped) chunks.push(stripped);
  }
  if (result.requirements_text) chunks.push(result.requirements_text);
  if (chunks.length === 0) return null;
  const combined = chunks.join("\n\n");
  return textLength(combined) > APPLICATION_NOTES_MAX_LENGTH ? [...combined].slice(0, APPLICATION_NOTES_MAX_LENGTH).join("") : combined;
}
