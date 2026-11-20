import type { CompanyCreateRequest } from "../company-create-request";

/**
 * The company an application being added will belong to.
 *
 * - tracked:          the extracted name matched a company already in the list.
 * - new:              a company that isn't tracked yet, named by the posting or typed in. Nothing is
 *                     added until Save, which adds `request` (or links the tracked company with its
 *                     name or domain, should there be one by then), so closing the form adds nothing.
 * - autoCreateFailed: the companies didn't load to match against, the name is too long to add, or nothing
 *                     was extracted (`name` is ""). Saving adds a company by that name when there is one.
 * - manual:           the person picked or typed the company themselves.
 */
export type ReviewCompanyState =
  | { kind: "tracked"; companyId: string; name: string; logoUrl: string | null }
  | { kind: "new"; request: CompanyCreateRequest; name: string; logoUrl: string | null }
  | { kind: "autoCreateFailed"; name: string }
  | { kind: "manual"; companyId: string | null; name: string; logoUrl: string | null };
