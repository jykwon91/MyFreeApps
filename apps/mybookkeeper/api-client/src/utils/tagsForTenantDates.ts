/**
 * A tenant's contract dates and ended status decide what the applicant, the applicant lists and
 * the tenant lists show (the default tenant list drops ended tenants, so it needs refetching to
 * gain one back). Every write that can change them must refresh all three.
 */
export function tagsForTenantDates(applicantId: string) {
  return [
    { type: "Applicant" as const, id: applicantId },
    { type: "Applicant" as const, id: "LIST" },
    { type: "Applicant" as const, id: "TENANT_LIST" },
  ];
}
