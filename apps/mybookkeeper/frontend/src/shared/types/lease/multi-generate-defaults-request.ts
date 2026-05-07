/**
 * Body for POST /lease-templates/generate-defaults (multi-template).
 *
 * Mirrors `schemas/leases/multi_generate_defaults_request.py`.
 */
export interface MultiGenerateDefaultsRequest {
  template_ids: string[];
  applicant_id: string;
}
