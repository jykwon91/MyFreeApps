import type { Company } from "../types/company";
import type { CompanyTextField } from "../types/company/company-text-field";

/** What a company has for this field, or undefined when it's missing (null, empty or only spaces). */
export function companyFieldText(company: Company, field: CompanyTextField): string | undefined {
  const value = company[field];
  return value && value.trim() !== "" ? value : undefined;
}
