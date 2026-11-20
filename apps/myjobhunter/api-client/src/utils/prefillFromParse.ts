import type { AddApplicationFormValues } from "../types/application/add-application-form-values";
import type { JdParseResponse } from "../types/application/jd-parse-response";
import { isRemoteType } from "./isRemoteType";
import { isSalaryPeriod } from "./isSalaryPeriod";

/** The form fields a parsed job description fills in. Fields it didn't find are left out. */
export function prefillFromParse(result: JdParseResponse): Partial<AddApplicationFormValues> {
  const prefill: Partial<AddApplicationFormValues> = {};
  if (result.title) prefill.role_title = result.title;
  if (result.location) prefill.location = result.location;
  if (result.remote_type && isRemoteType(result.remote_type) && result.remote_type !== "unknown") {
    prefill.remote_type = result.remote_type;
  }
  if (result.salary_min !== null) prefill.posted_salary_min = String(result.salary_min);
  if (result.salary_max !== null) prefill.posted_salary_max = String(result.salary_max);
  if (result.salary_period && isSalaryPeriod(result.salary_period)) prefill.posted_salary_period = result.salary_period;
  if (result.salary_currency) prefill.posted_salary_currency = result.salary_currency;
  return prefill;
}
