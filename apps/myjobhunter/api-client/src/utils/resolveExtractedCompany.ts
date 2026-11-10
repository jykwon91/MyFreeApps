import type { Company } from "../types/company";
import type { CompanyCreateRequest } from "../types/company-create-request";
import type { ExtractedCompanyHints } from "../types/application/extracted-company-hints";
import type { ExtractedCompanyResolution } from "../types/application/extracted-company-resolution";
import type { UrlHostname } from "../types/application/url-hostname";
import { findCompanyByName } from "./findCompanyByName";
import { websiteToDomain } from "./websiteToDomain";

/** A tracked company with the extracted name, else what to add, with the domain and logo the posting gave. */
export function resolveExtractedCompany(
  companies: readonly Company[],
  name: string | null,
  hostnameOf: UrlHostname,
  hints: ExtractedCompanyHints = {},
): ExtractedCompanyResolution {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return { kind: "none" };
  const existing = findCompanyByName(companies, trimmed);
  if (existing) return { kind: "existing", company: existing };
  const request: CompanyCreateRequest = { name: trimmed };
  const domain = websiteToDomain(hints.website, hostnameOf);
  if (domain) request.primary_domain = domain;
  if (hints.logoUrl) request.logo_url = hints.logoUrl;
  return { kind: "create", request };
}
