import type { ApplicationContact } from "../types/contact/application-contact";

/** The name to show for a contact, falling back to their email. Null when they have neither. */
export function contactDisplayName(contact: Pick<ApplicationContact, "name" | "email">): string | null {
  return contact.name ?? contact.email ?? null;
}
