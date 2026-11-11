import { EMPTY_COMPANY_FORM_VALUES } from "../constants/emptyCompanyFormValues";
import { COMPANY_FORM_PROBLEMS } from "../constants/companyFormProblems";
import { companyFormProblems } from "./companyFormProblems";

/** The message when a company name is over what the backend accepts, else undefined. A blank name is not "too long". */
export function companyNameProblem(name: string): string | undefined {
  const problem = companyFormProblems({ ...EMPTY_COMPANY_FORM_VALUES, name }).name;
  return problem === COMPANY_FORM_PROBLEMS.nameTooLong ? problem : undefined;
}
