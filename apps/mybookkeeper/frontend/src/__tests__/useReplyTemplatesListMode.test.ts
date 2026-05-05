import { describe, it, expect } from "vitest";
import { useReplyTemplatesListMode } from "@/app/features/inquiries/useReplyTemplatesListMode";
import type { ReplyTemplate } from "@/shared/types/inquiry/reply-template";

const TEMPLATE: ReplyTemplate = {
  id: "tpl-1",
  organization_id: "org-1",
  user_id: "user-1",
  name: "Initial inquiry reply",
  subject_template: "Re: $listing",
  body_template: "Hi $name",
  is_archived: false,
  display_order: 0,
  created_at: "2026-05-04T10:00:00Z",
  updated_at: "2026-05-04T10:00:00Z",
};

describe("useReplyTemplatesListMode", () => {
  it("returns 'loading' while fetching regardless of templates list", () => {
    expect(
      useReplyTemplatesListMode({ isLoading: true, templates: [] }),
    ).toBe("loading");
    expect(
      useReplyTemplatesListMode({ isLoading: true, templates: [TEMPLATE] }),
    ).toBe("loading");
  });

  it("returns 'empty' when loaded and templates list is empty", () => {
    expect(
      useReplyTemplatesListMode({ isLoading: false, templates: [] }),
    ).toBe("empty");
  });

  it("returns 'list' when loaded and templates are present", () => {
    expect(
      useReplyTemplatesListMode({ isLoading: false, templates: [TEMPLATE] }),
    ).toBe("list");
  });
});
