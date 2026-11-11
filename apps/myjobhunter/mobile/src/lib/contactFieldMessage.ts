import type { ContactFormErrors } from "@myjobhunter/api-client/types/contact/contact-form-errors";
import type { ContactFormField } from "@myjobhunter/api-client/types/contact/contact-form-field";
import type { ContactServerErrors } from "@myjobhunter/api-client/types/contact/contact-server-errors";
import { CONTACT_FIELD_PROBLEMS } from "../constants/contactFieldProblems";

/** What to show under one add-contact field: the sheet's own check first, else what the server said, else nothing. */
export function contactFieldMessage(errors: ContactFormErrors, serverErrors: ContactServerErrors, field: ContactFormField): string | undefined {
  const problem = errors[field];
  return problem ? CONTACT_FIELD_PROBLEMS[field][problem] : serverErrors[field];
}
