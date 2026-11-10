import type { Company } from "../types/company";

/** The tracked company with this name, ignoring case and surrounding spaces. */
export function findCompanyByName(companies: readonly Company[], name: string): Company | undefined {
  const wanted = name.trim().toLowerCase();
  return companies.find((company) => company.name.trim().toLowerCase() === wanted);
}
