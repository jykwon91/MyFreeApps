import { CONTACT_ROLE_LABELS } from "../constants/contactRoleLabels";
import { isContactRole } from "./isContactRole";
import { humanizeKey } from "./humanizeKey";

/** A contact's role as people read it. Null when the contact has none. */
export function formatContactRole(role: string | null): string | null {
  if (role === null || role === "") return null;
  if (isContactRole(role)) return CONTACT_ROLE_LABELS[role];
  return humanizeKey(role);
}
