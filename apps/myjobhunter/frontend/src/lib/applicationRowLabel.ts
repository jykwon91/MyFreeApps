import type { Application } from "@myjobhunter/api-client/types/application";

/**
 * The accessible name of an application row's link: the role and the company,
 * so two applications at the same company, or one with no company, still say
 * which application they open.
 */
export function applicationRowLabel(application: Pick<Application, "role_title" | "company_name">): string {
  return application.company_name
    ? `Open ${application.role_title} at ${application.company_name}`
    : `Open ${application.role_title}`;
}
