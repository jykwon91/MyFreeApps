/**
 * Body for POST /companies. Mirrors `CompanyCreateRequest` in
 * apps/myjobhunter/backend/app/schemas/company/company_create_request.py.
 */
export interface CompanyCreateRequest {
  name: string;
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
