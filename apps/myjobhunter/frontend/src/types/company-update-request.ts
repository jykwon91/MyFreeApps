/**
 * Body for PATCH /companies/{id}. Mirrors `CompanyUpdateRequest` in
 * apps/myjobhunter/backend/app/schemas/company/company_update_request.py.
 *
 * All fields are optional — only explicitly provided fields are applied.
 */
export interface CompanyUpdateRequest {
  name?: string | null;
  primary_domain?: string | null;
  logo_url?: string | null;
  industry?: string | null;
  size_range?: string | null;
  hq_location?: string | null;
  description?: string | null;
  external_ref?: string | null;
  external_source?: string | null;
  crunchbase_id?: string | null;
}
