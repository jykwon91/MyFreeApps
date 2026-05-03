/**
 * Minimal lease-template payload for list views.
 *
 * Mirrors `schemas/leases/lease_template_summary.py`.
 */
export interface LeaseTemplateSummary {
  id: string;
  user_id: string;
  organization_id: string;
  name: string;
  description: string | null;
  version: number;
  file_count: number;
  placeholder_count: number;
  created_at: string;
  updated_at: string;
}
