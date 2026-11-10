import type { CompanyHasApplicationsError } from "../types/company-has-applications-error";

/** True for the coded 409 the backend returns when a company still has applications. */
export function isCompanyHasApplicationsError(err: unknown): err is CompanyHasApplicationsError {
  if (err === null || typeof err !== "object") return false;
  const { status, data } = err as { status?: unknown; data?: unknown };
  if (status !== 409 || data === null || typeof data !== "object") return false;
  const detail = (data as { detail?: unknown }).detail;
  if (detail === null || typeof detail !== "object") return false;
  const { code, message, application_count } = detail as Record<string, unknown>;
  return (
    code === "COMPANY_HAS_APPLICATIONS" &&
    typeof message === "string" &&
    typeof application_count === "number"
  );
}
