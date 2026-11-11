import type { Company } from "../types/company";
import type { CompanySort } from "../types/company/company-sort";
import { companyFieldText } from "./companyFieldText";
import { compareCompanyText } from "./compareCompanyText";

/**
 * The companies in this order, as the website's table sorts a column: companies missing the value
 * stay last whichever way it runs, and ties keep the order they came in.
 */
export function sortCompanies(companies: readonly Company[], { field, order }: CompanySort): Company[] {
  const direction = order === "desc" ? -1 : 1;
  return companies
    .map((company, index) => ({ company, index, text: companyFieldText(company, field) }))
    .sort((a, b) => {
      if (a.text === undefined || b.text === undefined) {
        if (a.text !== b.text) return a.text === undefined ? 1 : -1;
        return a.index - b.index;
      }
      return direction * compareCompanyText(a.text, b.text) || a.index - b.index;
    })
    .map(({ company }) => company);
}
