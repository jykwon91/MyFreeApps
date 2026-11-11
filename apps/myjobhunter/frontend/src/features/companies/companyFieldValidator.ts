import { companyFormProblems } from "@myjobhunter/api-client/utils/companyFormProblems";
import type { CompanyFormValues } from "@myjobhunter/api-client/types/company/company-form-values";

/**
 * A react-hook-form `validate` for one add-company field: the same checks as the phone, against
 * the backend's limits. No maxLength on the inputs: a pasted value over the limit would be cut
 * silently, so the form says so instead.
 */
export function companyFieldValidator(field: keyof CompanyFormValues) {
  return (_value: string, values: CompanyFormValues): string | true => companyFormProblems(values)[field] ?? true;
}
