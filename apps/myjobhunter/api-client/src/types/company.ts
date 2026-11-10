/**
 * TypeScript model for a Company as returned by the MJH backend.
 * Mirrors `CompanyResponse` in
 * apps/myjobhunter/backend/app/schemas/company/company_response.py.
 */
export interface Company {
  id: string;
  user_id: string;
  name: string;
  primary_domain: string | null;
  logo_url: string | null;
  industry: string | null;
  size_range: string | null;
  hq_location: string | null;
  description: string | null;
  external_ref: string | null;
  external_source: string | null;
  crunchbase_id: string | null;
  created_at: string;
  updated_at: string;
}
