import { describe, expect, it } from "vitest";
import type { ReplyTemplate } from "@mybookkeeper/api-client/types/inquiry/reply-template";
import { archivedReplyTemplatesMode } from "@/app/features/inquiries/archivedReplyTemplatesMode";

const row = { id: "t1" } as ReplyTemplate;

describe("archivedReplyTemplatesMode", () => {
  it("loads before the first answer, and while retrying after a failure", () => {
    expect(archivedReplyTemplatesMode({ templates: undefined, isError: false, isFetching: true })).toBe("loading");
    expect(archivedReplyTemplatesMode({ templates: undefined, isError: true, isFetching: true })).toBe("loading");
  });

  it("says it couldn't load, never 'none', when the first load failed", () => {
    expect(archivedReplyTemplatesMode({ templates: undefined, isError: true, isFetching: false })).toBe("error");
  });

  it("keeps the rows it had when a reload fails, but doesn't keep saying 'none'", () => {
    expect(archivedReplyTemplatesMode({ templates: [row], isError: true, isFetching: false })).toBe("stale");
    expect(archivedReplyTemplatesMode({ templates: [], isError: true, isFetching: false })).toBe("error");
  });

  it("is empty only when a list loaded with nothing in it", () => {
    expect(archivedReplyTemplatesMode({ templates: [], isError: false, isFetching: false })).toBe("empty");
    expect(archivedReplyTemplatesMode({ templates: [row], isError: false, isFetching: false })).toBe("list");
  });
});
