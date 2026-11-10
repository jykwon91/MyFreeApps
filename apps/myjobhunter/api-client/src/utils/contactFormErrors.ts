import {
  CONTACT_EMAIL_MAX_LENGTH,
  CONTACT_LINKEDIN_MAX_LENGTH,
  CONTACT_NAME_MAX_LENGTH,
  CONTACT_NOTES_MAX_LENGTH,
} from "../constants/contactFieldLimits";
import type { ContactFormErrors } from "../types/contact/contact-form-errors";
import type { ContactFormValues } from "../types/contact/contact-form-values";
import { contactProfileUrl } from "./contactLinkUrls";
import { extractEmailAddress } from "./extractEmailAddress";
import { isPlainEmailAddress } from "./isPlainEmailAddress";
import { normalizeProfileUrl } from "./normalizeProfileUrl";

/**
 * What stops the add-contact form from being sent, by field: the backend's rules
 * (a name or an email, its length limits), plus an email `EmailStr` would refuse and a
 * profile that would only show as plain text. Values are judged as `contactCreateRequest`
 * sends them: trimmed, the address taken out of `Name <…>`, and `https://` added to a bare link.
 */
export function contactFormErrors(values: ContactFormValues): ContactFormErrors {
  const name = values.name.trim();
  const email = extractEmailAddress(values.email);
  const profile = normalizeProfileUrl(values.linkedin_url);
  const errors: ContactFormErrors = {};

  if (name === "" && email === "") errors.name = "identity_required";
  else if (name.length > CONTACT_NAME_MAX_LENGTH) errors.name = "too_long";

  if (email.length > CONTACT_EMAIL_MAX_LENGTH) errors.email = "too_long";
  else if (email !== "" && !isPlainEmailAddress(email)) errors.email = "invalid";

  if (profile.length > CONTACT_LINKEDIN_MAX_LENGTH) errors.linkedin_url = "too_long";
  else if (profile !== "" && contactProfileUrl(profile) === null) errors.linkedin_url = "invalid";

  if (values.notes.trim().length > CONTACT_NOTES_MAX_LENGTH) errors.notes = "too_long";
  return errors;
}
