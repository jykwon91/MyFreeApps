import {
  useCreateCompanyMutation,
  useLazyListCompaniesQuery,
  useTriggerCompanyResearchMutation,
} from "../store/companiesApi";
import type { CompanyResolver, IsCurrent } from "../types/application/company-resolver";
import type { ExtractedCompanyHints } from "../types/application/extracted-company-hints";
import type { ReadCompanyOutcome } from "../types/application/read-company-outcome";
import type { ReviewCompanyState } from "../types/application/review-company-state";
import type { UrlHostname } from "../types/application/url-hostname";
import type { Company } from "../types/company";
import type { CompanyCreateRequest } from "../types/company-create-request";
import { findCompanyByName } from "../utils/findCompanyByName";
import { readCompanyId } from "../utils/readCompanyId";
import { resolveExtractedCompany } from "../utils/resolveExtractedCompany";

/**
 * Matches against the companies fetched now, waiting for GET /companies if it hasn't loaded, never
 * against a list captured when the read began: that one is empty until the list loads, and a company
 * already tracked would be added twice (with no domain, nothing on the server stops it).
 */
export function useCompanyResolver(hostnameOf: UrlHostname): CompanyResolver {
  const [loadCompanies] = useLazyListCompaniesQuery();
  const [createCompany] = useCreateCompanyMutation();
  const [triggerCompanyResearch] = useTriggerCompanyResearchMutation();

  /** `fresh` refetches even when the list is cached; otherwise a cached or in-flight list will do. */
  async function trackedCompanies(fresh: boolean): Promise<Company[]> {
    return (await loadCompanies(undefined, !fresh).unwrap()).items;
  }

  async function addCompany(request: CompanyCreateRequest): Promise<Company> {
    const created = await createCompany(request).unwrap();
    void triggerCompanyResearch(created.id)
      .unwrap()
      .catch((error: unknown) => console.warn("Background company research failed:", error));
    return created;
  }

  async function resolveReadCompany(
    name: string | null,
    hints: ExtractedCompanyHints,
    isCurrent: IsCurrent,
  ): Promise<ReadCompanyOutcome> {
    let companies: Company[];
    try {
      companies = await trackedCompanies(false);
    } catch (error) {
      if (!isCurrent()) return { kind: "stale" };
      const typed = name?.trim() ?? "";
      const company = { kind: "autoCreateFailed", name: typed } as const;
      return typed ? { kind: "failed", reason: "listUnavailable", company, error } : { kind: "resolved", company };
    }
    if (!isCurrent()) return { kind: "stale" };
    const resolution = resolveExtractedCompany(companies, name, hostnameOf, hints);
    if (resolution.kind === "none") return { kind: "resolved", company: { kind: "autoCreateFailed", name: "" } };
    if (resolution.kind === "existing") {
      const { id, name: existingName, logo_url } = resolution.company;
      return { kind: "resolved", company: { kind: "tracked", companyId: id, name: existingName, logoUrl: logo_url } };
    }
    try {
      const created = await addCompany(resolution.request);
      if (!isCurrent()) return { kind: "stale" };
      return {
        kind: "resolved",
        company: { kind: "new", companyId: created.id, name: created.name, logoUrl: created.logo_url },
      };
    } catch (error) {
      if (!isCurrent()) return { kind: "stale" };
      const company = { kind: "autoCreateFailed", name: resolution.request.name } as const;
      return { kind: "failed", reason: "addFailed", company, error };
    }
  }

  async function companyIdForSave(company: ReviewCompanyState, isCurrent: IsCurrent): Promise<string | null> {
    const id = readCompanyId(company);
    if (id || company.kind !== "autoCreateFailed" || !company.name) return id;
    const tracked = await trackedCompanies(true);
    if (!isCurrent()) return null;
    const existing = findCompanyByName(tracked, company.name);
    if (existing) return existing.id;
    return (await addCompany({ name: company.name })).id;
  }

  return { addCompany, resolveReadCompany, companyIdForSave };
}
