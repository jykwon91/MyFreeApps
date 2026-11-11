import type { Company } from "@myjobhunter/api-client/types/company";
import { companyFieldText } from "@myjobhunter/api-client/utils/companyFieldText";
import { COMPANY_DETAIL_MESSAGES as MESSAGES } from "../constants/companyDetail";
import type { OverviewFactProps } from "../types/OverviewFactProps";
import { formatShortDate } from "./formatShortDate";

/** The website's company facts, in its order, with a dash for whatever the company doesn't have. */
export function companyOverviewFacts(company: Company): OverviewFactProps[] {
  return [
    { label: MESSAGES.hqLabel, value: companyFieldText(company, "hq_location") ?? MESSAGES.none },
    { label: MESSAGES.createdLabel, value: formatShortDate(company.created_at) },
    { label: MESSAGES.domainLabel, value: companyFieldText(company, "primary_domain") ?? MESSAGES.none },
    { label: MESSAGES.industryLabel, value: companyFieldText(company, "industry") ?? MESSAGES.none },
  ];
}
