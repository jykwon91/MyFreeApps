import { CONTACT_ROLE_LABELS } from "../constants/contactRoleLabels";
import type { ContactRole } from "../types/contact/contact-role";

/** True for a contact role this client knows; stored rows may carry one added later on the backend. */
export function isContactRole(value: string): value is ContactRole {
  return Object.prototype.hasOwnProperty.call(CONTACT_ROLE_LABELS, value);
}
