/**
 * TypeScript type for POST /applications/extract-from-url response.
 * Mirrors `JdUrlExtractResponse` in
 * apps/myjobhunter/backend/app/schemas/application/jd_url_extract_response.py.
 *
 * All fields are nullable except `source_url` — the source URL is always
 * echoed back so the UI can display "Fetched from <url>" alongside the
 * pre-fill banner.
 *
 * `description_html` is HTML when the source publishes it that way
 * (schema.org JobPosting.description is commonly an HTML string). The
 * frontend renders it via plain-text textarea today; future iterations
 * may sanitise + render the HTML inline.
 *
 * `requirements_text` is plain text or Markdown — when populated by the
 * Claude HTML-text fallback it's a Markdown bullet block ("Must have:\n
 * - X\n- Y\n\nNice to have:\n- Z"). When populated from schema.org
 * JobPosting.responsibilities it's a newline-joined plain-text list.
 */
export interface JdUrlExtractResponse {
  title: string | null;
  company: string | null;
  /**
   * Canonical company website (schema.org JobPosting
   * `hiringOrganization.sameAs`). Populated only on the schema.org
   * fast path; the Claude HTML-text fallback returns null. Used by
   * the auto-create flow to populate `primary_domain`.
   */
  company_website: string | null;
  /** Company logo URL (schema.org `hiringOrganization.logo`). */
  company_logo_url: string | null;
  location: string | null;
  description_html: string | null;
  requirements_text: string | null;
  summary: string | null;
  source_url: string;
}
