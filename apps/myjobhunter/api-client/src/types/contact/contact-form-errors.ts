import type { ContactFieldProblem } from "./contact-field-problem";
import type { ContactFormField } from "./contact-form-field";

/** The add-contact form's problems by field. Empty when it can be sent. */
export type ContactFormErrors = Partial<Record<ContactFormField, ContactFieldProblem>>;
