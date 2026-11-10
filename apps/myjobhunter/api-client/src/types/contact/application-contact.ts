/**
 * A person tied to an application, as GET /applications/{id} embeds it.
 * Mirrors `ApplicationContactResponse` in
 * apps/myjobhunter/backend/app/schemas/application/application_contact_response.py.
 *
 * `role` is a plain string: a role added on the backend after this client
 * was built still arrives, and `formatContactRole` reads it sensibly.
 */
export interface ApplicationContact {
  id: string;
  user_id: string;
  application_id: string;
  name: string | null;
  email: string | null;
  linkedin_url: string | null;
  role: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}
