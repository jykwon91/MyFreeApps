/**
 * One template contributing to a signed lease.
 *
 * Mirrors `schemas/leases/signed_lease_template_link.py`.
 */
export interface SignedLeaseTemplateLink {
  id: string;
  name: string;
  version: number;
  display_order: number;
}
