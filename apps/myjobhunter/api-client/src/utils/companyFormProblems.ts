import {
  COMPANY_DOMAIN_MAX_LENGTH,
  COMPANY_HQ_LOCATION_MAX_LENGTH,
  COMPANY_INDUSTRY_MAX_LENGTH,
  COMPANY_NAME_MAX_LENGTH,
} from "../constants/companyFieldLimits";
import { COMPANY_FORM_PROBLEMS as PROBLEMS } from "../constants/companyFormProblems";
import type { CompanyFormProblems } from "../types/company/company-form-problems";
import type { CompanyFormValues } from "../types/company/company-form-values";
import { textLength } from "./textLength";

/**
 * What stops the add-company form saving, checked against what is sent (trimmed) and counted in
 * code points as the backend counts. Empty when it can be saved.
 */
export function companyFormProblems(values: CompanyFormValues): CompanyFormProblems {
  const problems: CompanyFormProblems = {};
  const name = values.name.trim();
  if (!name) problems.name = PROBLEMS.nameRequired;
  else if (textLength(name) > COMPANY_NAME_MAX_LENGTH) problems.name = PROBLEMS.nameTooLong;
  if (textLength(values.primary_domain.trim()) > COMPANY_DOMAIN_MAX_LENGTH) problems.primary_domain = PROBLEMS.domainTooLong;
  if (textLength(values.industry.trim()) > COMPANY_INDUSTRY_MAX_LENGTH) problems.industry = PROBLEMS.industryTooLong;
  if (textLength(values.hq_location.trim()) > COMPANY_HQ_LOCATION_MAX_LENGTH) problems.hq_location = PROBLEMS.hqLocationTooLong;
  return problems;
}
