/**
 * One template contributing to a signed lease.
 *
 * Mirrors `schemas/leases/signed_lease_template_link.py`. `name` / `version`
 * are the template's current values; the `*_snapshot` fields are what the
 * lease's documents were last rendered from (null when not rendered yet, or
 * the version unknown for links rendered before it was recorded).
 */
export interface SignedLeaseTemplateLink {
  id: string;
  name: string;
  version: number;
  display_order: number;
  template_name_snapshot: string | null;
  template_version_snapshot: number | null;
}
