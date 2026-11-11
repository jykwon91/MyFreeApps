import type { CompanyCreateRequest } from "../types/company-create-request";
import type { CompanyFormValues } from "../types/company/company-form-values";

/** The add-company form as POST /companies takes it: trimmed, with blank optional fields sent as null. */
export function companyCreateRequest(values: CompanyFormValues): CompanyCreateRequest {
  return {
    name: values.name.trim(),
    primary_domain: values.primary_domain.trim() || null,
    industry: values.industry.trim() || null,
    hq_location: values.hq_location.trim() || null,
  };
}
