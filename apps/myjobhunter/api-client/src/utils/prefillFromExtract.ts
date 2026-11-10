import type { AddApplicationFormValues } from "../types/application/add-application-form-values";
import type { HtmlTextContent } from "../types/application/html-text-content";
import type { JdUrlExtractResponse } from "../types/application/jd-url-extract-response";
import { combineNotes } from "./combineNotes";

/** The form fields a read job-posting link fills in. Fields it didn't find are left out. */
export function prefillFromExtract(result: JdUrlExtractResponse, textContent: HtmlTextContent): Partial<AddApplicationFormValues> {
  const prefill: Partial<AddApplicationFormValues> = {};
  if (result.title) prefill.role_title = result.title;
  if (result.location) prefill.location = result.location;
  const notes = combineNotes(result, textContent);
  if (notes) prefill.notes = notes;
  return prefill;
}
