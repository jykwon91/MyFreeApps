import { LEASE_TEMPLATE_SOURCE_COPY } from "../constants/leaseTemplateSource";
import type { SignedLeaseTemplateLink } from "../types/lease/signed-lease-template-link";

/** "Generated from <name> v<N>", without the version when it is unknown, or null if never rendered. */
export function leaseTemplateSourceLabel(link: SignedLeaseTemplateLink): string | null {
  const name = link.template_name_snapshot;
  if (name === null) return null;
  const label = `${LEASE_TEMPLATE_SOURCE_COPY.generatedFrom} ${name}`;
  return link.template_version_snapshot === null ? label : `${label} v${link.template_version_snapshot}`;
}
