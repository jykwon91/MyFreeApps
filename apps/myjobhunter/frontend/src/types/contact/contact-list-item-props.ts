import type { ApplicationContact } from "@myjobhunter/api-client/types/contact/application-contact";

export interface ContactListItemProps {
  contact: ApplicationContact;
  /** Asks before removing; the manager owns the confirm. */
  onRemove: (contact: ApplicationContact) => void;
  /** True while this contact's removal is on its way. */
  isRemoving: boolean;
}
