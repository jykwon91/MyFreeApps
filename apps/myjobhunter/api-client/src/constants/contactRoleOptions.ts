import type { ContactRole } from "../types/contact/contact-role";
import type { ContactRoleOption } from "../types/contact/contact-role-option";
import { CONTACT_ROLE_LABELS } from "./contactRoleLabels";

/** Every contact role with its label, for a picker. */
export const CONTACT_ROLE_OPTIONS: readonly ContactRoleOption[] = (
  Object.entries(CONTACT_ROLE_LABELS) as [ContactRole, string][]
).map(([value, label]) => ({ value, label }));
