import type { ContactFormField } from "./contact-form-field";

/** What the server said was wrong with each add-contact field, from a 422's `detail[].loc`. */
export type ContactServerErrors = Partial<Record<ContactFormField, string>>;
