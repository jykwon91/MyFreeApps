import type { ApplicationContact } from "@myjobhunter/api-client/types/contact/application-contact";

export interface ContactCardProps {
  applicationId: string;
  contact: ApplicationContact;
}
