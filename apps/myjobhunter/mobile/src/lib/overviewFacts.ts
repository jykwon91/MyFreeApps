import type { Application } from "@myjobhunter/api-client/types/application";
import { formatFitScore } from "@myjobhunter/api-client/utils/formatFitScore";
import { formatRemoteType } from "@myjobhunter/api-client/utils/formatRemoteType";
import { formatSalaryRange } from "@platform/core/utils/salaryRange";
import { APPLICATION_DETAIL_MESSAGES as MESSAGES } from "../constants/applicationDetail";
import type { OverviewFactProps } from "../types/OverviewFactProps";
import { formatShortDate } from "./formatShortDate";

/** The website's overview facts, in its order, with a dash for whatever the application doesn't say. */
export function overviewFacts(application: Application): OverviewFactProps[] {
  const { posted_salary_min, posted_salary_max, posted_salary_currency, posted_salary_period } = application;
  return [
    { label: MESSAGES.appliedLabel, value: application.applied_at ? formatShortDate(application.applied_at) : MESSAGES.none },
    { label: MESSAGES.fitLabel, value: formatFitScore(application.fit_score) ?? MESSAGES.none },
    { label: MESSAGES.salaryLabel, value: formatSalaryRange(posted_salary_min, posted_salary_max, posted_salary_currency, posted_salary_period) },
    { label: MESSAGES.locationLabel, value: application.location ?? MESSAGES.none },
    { label: MESSAGES.remoteLabel, value: formatRemoteType(application.remote_type) ?? MESSAGES.none },
    { label: MESSAGES.sourceLabel, value: application.source ?? MESSAGES.none },
  ];
}
