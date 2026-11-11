import type { Company } from "../types/company";
import type { CompanySortField } from "../types/company/company-sort-field";

/** What a company has for this field, or undefined when it's missing (null, empty or only spaces). */
export function companyFieldText(company: Company, field: CompanySortField): string | undefined {
  const value = company[field];
  return value && value.trim() !== "" ? value : undefined;
}
