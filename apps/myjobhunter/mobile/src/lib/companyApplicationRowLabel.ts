import type { Application } from "@myjobhunter/api-client/types/application";
import { applicationDetails } from "../features/applications/applicationDisplay";

/** Everything a company's application row shows, in order, for a screen reader. */
export function companyApplicationRowLabel(application: Application): string {
  const details = applicationDetails(application);
  return details ? `${application.role_title}, ${details}` : application.role_title;
}
