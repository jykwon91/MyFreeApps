import type { ReviewCompanyState } from "@myjobhunter/api-client/types/application/review-company-state";
import { companyNameProblem } from "@myjobhunter/api-client/utils/companyNameProblem";
import { ADD_APPLICATION_MESSAGES as MESSAGES } from "../constants/addApplication";

/** What the company field says under its value: the website's pill, in words. */
export function companyFieldHint(company: ReviewCompanyState): string {
  switch (company.kind) {
    case "tracked":
      return MESSAGES.companyTracked;
    case "new":
      return MESSAGES.companyAdded;
    case "manual":
      return MESSAGES.companyChosen;
    case "autoCreateFailed":
      if (!company.name) return MESSAGES.companyNotFound;
      return companyNameProblem(company.name) ?? MESSAGES.companyAddFailed;
  }
}
