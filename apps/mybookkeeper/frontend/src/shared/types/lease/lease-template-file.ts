/**
 * A single source file inside a lease template bundle.
 *
 * Mirrors `schemas/leases/lease_template_file_response.py`. ``presigned_url``
 * is null when storage is unavailable.
 */
export interface LeaseTemplateFile {
  id: string;
  template_id: string;
  filename: string;
  storage_key: string;
  content_type: string;
  size_bytes: number;
  display_order: number;
  created_at: string;
  presigned_url: string | null;
}
