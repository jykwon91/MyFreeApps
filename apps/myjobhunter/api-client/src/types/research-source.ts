/**
 * TypeScript model for a ResearchSource as returned by the MJH backend.
 * Mirrors `ResearchSourceResponse` in
 * apps/myjobhunter/backend/app/schemas/company/research_source_response.py.
 */
export interface ResearchSource {
  id: string;
  company_research_id: string;
  url: string;
  title: string | null;
  snippet: string | null;
  source_type: string;
  fetched_at: string;
  created_at: string;
}
