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

export function stripHtml(html: string): string {
  return html
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\s*\/?\s*(p|li|div|h[1-6])[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
