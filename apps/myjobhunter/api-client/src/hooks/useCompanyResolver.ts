import { useCreateCompanyMutation, useLazyListCompaniesQuery } from "../store/companiesApi";
import { useStartCompanyResearch } from "./useStartCompanyResearch";
import type { CompanyResolver, IsCurrent } from "../types/application/company-resolver";
import type { ExtractedCompanyHints } from "../types/application/extracted-company-hints";
import type { ReadCompanyOutcome } from "../types/application/read-company-outcome";
import type { ReviewCompanyState } from "../types/application/review-company-state";
import type { UrlHostname } from "../types/application/url-hostname";
import type { Company } from "../types/company";
import type { CompanyCreateRequest } from "../types/company-create-request";
import { companyNameProblem } from "../utils/companyNameProblem";
import { companyToAdd } from "../utils/companyToAdd";
import { findCompanyByDomain } from "../utils/findCompanyByDomain";
import { findCompanyByName } from "../utils/findCompanyByName";
import { isDuplicateCompanyDomainError } from "../utils/isDuplicateCompanyDomainError";
import { newCompanyDraft } from "../utils/newCompanyDraft";
import { readCompanyId } from "../utils/readCompanyId";
import { resolveExtractedCompany } from "../utils/resolveExtractedCompany";

/**
 * Matches against the companies fetched now, waiting for GET /companies if it hasn't loaded, never
 * against a list captured when the read began: that one is empty until the list loads, and a company
 * already tracked would be added twice (with no domain, nothing on the server stops it).
 *
 * Reading only matches: a company that isn't tracked is held as new and added by Save, so a form
 * closed without saving leaves no company behind.
 */
export function useCompanyResolver(hostnameOf: UrlHostname): CompanyResolver {
  const [loadCompanies] = useLazyListCompaniesQuery();
  const [createCompany] = useCreateCompanyMutation();
  const startCompanyResearch = useStartCompanyResearch();

  /** `fresh` refetches even when the list is cached; otherwise a cached or in-flight list will do. */
  async function trackedCompanies(fresh: boolean): Promise<Company[]> {
    return (await loadCompanies(undefined, !fresh).unwrap()).items;
  }

  async function addCompany(request: CompanyCreateRequest): Promise<Company> {
    const created = await createCompany(request).unwrap();
    // Keyed to the new company, so opening it while this runs shows the run rather than offering a second.
    void startCompanyResearch(created.id).catch((error: unknown) => console.warn("Background company research failed:", error));
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
    const nameProblem = companyNameProblem(resolution.request.name);
    if (nameProblem) {
      const company = { kind: "autoCreateFailed", name: resolution.request.name } as const;
      return { kind: "failed", reason: "nameTooLong", company, error: new Error(nameProblem) };
    }
    return { kind: "resolved", company: newCompanyDraft(resolution.request) };
  }

  /** The company already tracked under this name or domain, else undefined. */
  function findTracked(companies: readonly Company[], request: CompanyCreateRequest): Company | undefined {
    return findCompanyByName(companies, request.name) ?? findCompanyByDomain(companies, request.primary_domain);
  }

  async function companyIdForSave(company: ReviewCompanyState): Promise<string | null> {
    const id = readCompanyId(company);
    if (id) return id;
    const request = companyToAdd(company);
    if (!request) return null;
    const nameProblem = companyNameProblem(request.name);
    if (nameProblem) throw new Error(nameProblem);
    const tracked = findTracked(await trackedCompanies(true), request);
    if (tracked) return tracked.id;
    try {
      return (await addCompany(request)).id;
    } catch (error) {
      // Another of your companies has this domain (added meanwhile, or under another name): use it.
      if (!request.primary_domain || !isDuplicateCompanyDomainError(error)) throw error;
      const holder = findCompanyByDomain(await trackedCompanies(true), request.primary_domain);
      if (!holder) throw error;
      return holder.id;
    }
  }

  return { resolveReadCompany, companyIdForSave };
}
