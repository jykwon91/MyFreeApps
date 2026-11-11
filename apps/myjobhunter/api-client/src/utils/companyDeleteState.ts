import type { ApplicationsPagesState } from "../types/application/applications-pages-state";
import type { CompanyDeleteState } from "../types/company/company-delete-state";

/** Whether the company whose applications these are can be deleted yet. */
export function companyDeleteState(list: Pick<ApplicationsPagesState, "isLoading" | "loadError" | "total">): CompanyDeleteState {
  if (list.isLoading || list.loadError !== undefined) return "waiting";
  return list.total > 0 ? "blocked" : "allowed";
}
