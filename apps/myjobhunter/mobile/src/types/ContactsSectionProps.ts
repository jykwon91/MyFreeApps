import type { ApplicationContact } from "@myjobhunter/api-client/types/contact/application-contact";

export interface ContactsSectionProps {
  applicationId: string;
  contacts: readonly ApplicationContact[];
}
