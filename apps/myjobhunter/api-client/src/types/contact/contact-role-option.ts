import type { ContactRole } from "./contact-role";

/** A contact role as a picker offers it. */
export interface ContactRoleOption {
  value: ContactRole;
  label: string;
}
