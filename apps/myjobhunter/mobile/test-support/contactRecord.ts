import type { ApplicationContact } from "@myjobhunter/api-client/types/contact/application-contact";

/** A person on an application, with whatever a test cares about changed. */
export function contactRecord(overrides: Partial<ApplicationContact> & Pick<ApplicationContact, "id" | "application_id">): ApplicationContact {
  return {
    user_id: "u1",
    name: null,
    email: null,
    linkedin_url: null,
    role: null,
    notes: null,
    created_at: "2026-10-21T00:00:00Z",
    updated_at: "2026-10-21T00:00:00Z",
    ...overrides,
  };
}
