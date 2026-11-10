import type { Document } from "@myjobhunter/api-client/types/document/document";

/** A text document, unless a test gives it a file. */
export function documentRecord(overrides: Partial<Document> & Pick<Document, "id">): Document {
  return {
    user_id: "u1",
    application_id: null,
    title: "Cover letter",
    kind: "cover_letter",
    body: "Dear hiring team",
    filename: null,
    content_type: null,
    size_bytes: null,
    has_file: false,
    deleted_at: null,
    created_at: "2026-10-21T00:00:00Z",
    updated_at: "2026-10-21T00:00:00Z",
    ...overrides,
  };
}
