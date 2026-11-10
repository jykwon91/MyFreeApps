import type { ReviewCompanyState } from "@myjobhunter/api-client/types/application/review-company-state";
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
      return company.name ? MESSAGES.companyAddFailed : MESSAGES.companyNotFound;
  }
}
