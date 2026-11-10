import {
  CONTACT_EMAIL_MAX_LENGTH,
  CONTACT_LINKEDIN_MAX_LENGTH,
  CONTACT_NAME_MAX_LENGTH,
  CONTACT_NOTES_MAX_LENGTH,
} from "@myjobhunter/api-client/constants/contactFieldLimits";
import type { ContactFieldProblem } from "@myjobhunter/api-client/types/contact/contact-field-problem";
import type { ContactFormField } from "@myjobhunter/api-client/types/contact/contact-form-field";

/** What the add-contact dialog says under a field for each problem `contactFormErrors` can report. */
export const CONTACT_FIELD_PROBLEM_MESSAGES: Record<ContactFormField, Partial<Record<ContactFieldProblem, string>>> = {
  name: {
    identity_required: "Add a name or an email.",
    too_long: `Keep the name to ${CONTACT_NAME_MAX_LENGTH} characters.`,
  },
  email: {
    invalid: "Enter one email address, like sam@company.com.",
    too_long: `Keep the email to ${CONTACT_EMAIL_MAX_LENGTH} characters.`,
  },
  linkedin_url: {
    invalid: "Paste the full link, starting with https://.",
    too_long: `Keep the link to ${CONTACT_LINKEDIN_MAX_LENGTH} characters.`,
  },
  role: {},
  notes: {
    too_long: `Keep the notes to ${CONTACT_NOTES_MAX_LENGTH} characters.`,
  },
};
