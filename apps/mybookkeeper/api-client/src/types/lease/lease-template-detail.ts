import type { LeaseTemplateFile } from "./lease-template-file";
import type { LeaseTemplatePlaceholder } from "./lease-template-placeholder";

/**
 * Lease template detail (with files + placeholders).
 *
 * Mirrors `schemas/leases/lease_template_response.py`.
 */
export interface LeaseTemplateDetail {
  id: string;
  user_id: string;
  organization_id: string;
  name: string;
  description: string | null;
  version: number;
  files: LeaseTemplateFile[];
  placeholders: LeaseTemplatePlaceholder[];
  created_at: string;
  updated_at: string;
}
