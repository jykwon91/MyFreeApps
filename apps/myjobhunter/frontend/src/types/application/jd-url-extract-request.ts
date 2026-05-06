/**
 * TypeScript type for POST /applications/extract-from-url request body.
 * Mirrors `JdUrlExtractRequest` in
 * apps/myjobhunter/backend/app/schemas/application/jd_url_extract_request.py.
 *
 * The backend validates the URL via Pydantic AnyHttpUrl — only http(s)
 * URLs with a host are accepted. Anything else returns 422 at the
 * schema layer before the service runs.
 */
export interface JdUrlExtractRequest {
  url: string;
}
