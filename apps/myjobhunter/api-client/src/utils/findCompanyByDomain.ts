import type { Company } from "../types/company";

/** The tracked company with this domain, ignoring case. None for a missing domain. */
export function findCompanyByDomain(companies: readonly Company[], domain: string | null | undefined): Company | undefined {
  const wanted = domain?.trim().toLowerCase();
  if (!wanted) return undefined;
  return companies.find((company) => company.primary_domain?.toLowerCase() === wanted);
}
