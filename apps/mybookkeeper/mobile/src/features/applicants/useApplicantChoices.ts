import { useApplicantsPages } from "@mybookkeeper/api-client/hooks/useApplicantsPages";
import type { ApplicantsPagesState } from "@mybookkeeper/api-client/types/applicant/applicants-pages-state";
import { useMemo } from "react";
import { pagedChoices } from "../../lib/pagedChoices";
import type { PagedChoices } from "../../types/PagedChoices";
import { applicantName } from "./applicantDisplay";

/** Every applicant, a page at a time, for the pickers that choose one. */
export function useApplicantChoices(): PagedChoices<ApplicantsPagesState> {
  const pages = useApplicantsPages({});
  const { applicants } = pages;
  const options = useMemo(
    () => applicants.map((applicant) => ({ value: applicant.id, label: applicantName(applicant.legal_name) })),
    [applicants],
  );
  return pagedChoices(pages, options);
}
