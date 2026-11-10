import type { Company } from "../types/company";

/** Companies whose name or domain contains the query, ignoring case. An empty query matches all. */
export function filterCompanies(companies: readonly Company[], query: string): Company[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...companies];
  return companies.filter(
    (company) => company.name.toLowerCase().includes(q) || (company.primary_domain ?? "").toLowerCase().includes(q),
  );
}
