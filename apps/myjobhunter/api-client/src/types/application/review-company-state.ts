/**
 * The company an application being added will belong to.
 *
 * - tracked:          the extracted name matched a company already in the list.
 * - new:              the extracted (or typed) name was just added as a company.
 * - autoCreateFailed: adding the company failed, or nothing was extracted (`name` is "").
 *                     Saving retries the add when there is a name.
 * - manual:           the person picked or typed the company themselves.
 */
export type ReviewCompanyState =
  | { kind: "tracked"; companyId: string; name: string; logoUrl: string | null }
  | { kind: "new"; companyId: string; name: string; logoUrl: string | null }
  | { kind: "autoCreateFailed"; name: string }
  | { kind: "manual"; companyId: string | null; name: string; logoUrl: string | null };
