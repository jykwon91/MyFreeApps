import type { ContactRole } from "./contact-role";

/**
 * Body for POST /applications/{id}/contacts. Mirrors `ApplicationContactCreateRequest` in
 * apps/myjobhunter/backend/app/schemas/application/application_contact_create_request.py.
 * Every field is optional, but the backend needs a name or an email.
 */
export interface ApplicationContactCreateRequest {
  name?: string;
  email?: string;
  linkedin_url?: string;
  role?: ContactRole;
  notes?: string;
}
