import type { ApplicationContact } from "@myjobhunter/api-client/types/contact/application-contact";

export interface ContactsManagerProps {
  applicationId: string;
  /** As GET /applications/{id} embeds them. */
  contacts: readonly ApplicationContact[];
}
