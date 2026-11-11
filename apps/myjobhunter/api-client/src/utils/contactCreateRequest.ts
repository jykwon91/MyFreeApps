import type { ApplicationContactCreateRequest } from "../types/contact/application-contact-create-request";
import type { ContactFormValues } from "../types/contact/contact-form-values";
import { extractEmailAddress } from "./extractEmailAddress";
import { normalizeProfileUrl } from "./normalizeProfileUrl";

/**
 * The add-contact form as POST /applications/{id}/contacts takes it: trimmed, the address taken
 * out of `Name <…>`, `https://` added to a link pasted without one, and blank fields left out.
 */
export function contactCreateRequest(values: ContactFormValues): ApplicationContactCreateRequest {
  const request: ApplicationContactCreateRequest = {};
  const name = values.name.trim();
  const email = extractEmailAddress(values.email);
  const profile = normalizeProfileUrl(values.linkedin_url);
  const notes = values.notes.trim();
  if (name !== "") request.name = name;
  if (email !== "") request.email = email;
  if (profile !== "") request.linkedin_url = profile;
  if (values.role !== "") request.role = values.role;
  if (notes !== "") request.notes = notes;
  return request;
}
