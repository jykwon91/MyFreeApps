import type { ContactFormErrors } from "../types/contact/contact-form-errors";

/** True when the add-contact form has anything stopping it from being sent. */
export function hasContactFormErrors(errors: ContactFormErrors): boolean {
  return Object.keys(errors).length > 0;
}
