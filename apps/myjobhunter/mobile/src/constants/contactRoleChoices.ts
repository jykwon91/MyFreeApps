import { CONTACT_ROLE_OPTIONS } from "@myjobhunter/api-client/constants/contactRoleOptions";
import type { ContactRole } from "@myjobhunter/api-client/types/contact/contact-role";
import type { SheetOption } from "@platform/mobile";
import { APPLICATION_CONTACT_MESSAGES } from "./applicationContacts";

/** The add-contact sheet's role choices: "No role" (which clears it, as on the website), then every shared role. */
export const CONTACT_ROLE_CHOICES: readonly SheetOption<ContactRole | "">[] = [
  { value: "", label: APPLICATION_CONTACT_MESSAGES.noRole },
  ...CONTACT_ROLE_OPTIONS,
];
