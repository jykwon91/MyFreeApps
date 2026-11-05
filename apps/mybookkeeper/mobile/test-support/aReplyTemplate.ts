import type { ReplyTemplate } from "@mybookkeeper/api-client/types/inquiry/reply-template";

export function aReplyTemplate(overrides: Partial<ReplyTemplate> = {}): ReplyTemplate {
  return {
    id: "t1",
    organization_id: "o",
    user_id: "u",
    name: "Polite decline",
    subject_template: "About $listing",
    body_template: "Hi $name,\n\nSorry, it's taken.\n\n- $host_name",
    is_archived: false,
    display_order: 0,
    created_at: "2026-01-01T12:00:00Z",
    updated_at: "2026-01-01T12:00:00Z",
    ...overrides,
  };
}
