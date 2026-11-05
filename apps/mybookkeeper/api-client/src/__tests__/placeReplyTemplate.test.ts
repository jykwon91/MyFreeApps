import { describe, expect, it } from "vitest";
import type { ReplyTemplate } from "../types/inquiry/reply-template";
import { placeReplyTemplate } from "../utils/placeReplyTemplate";

function template(id: string, name: string, display_order = 0, extra: Partial<ReplyTemplate> = {}): ReplyTemplate {
  return {
    id,
    organization_id: "o",
    user_id: "u",
    name,
    subject_template: "s",
    body_template: "b",
    is_archived: false,
    display_order,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...extra,
  };
}

describe("placeReplyTemplate", () => {
  const a = template("a", "Alpha");
  const c = template("c", "Charlie");

  it("swaps in the new version where the old one was", () => {
    const renamed = template("c", "Zulu");
    expect(placeReplyTemplate([a, c], renamed, true)).toEqual([a, renamed]);
  });

  it("puts a new one in the server's order", () => {
    const b = template("b", "Bravo");
    expect(placeReplyTemplate([a, c], b, true).map((t) => t.id)).toEqual(["a", "b", "c"]);
  });

  it("orders by display order before name", () => {
    const first = template("z", "Zulu", -1);
    const last = template("y", "Aardvark", 5);
    expect(placeReplyTemplate([a, c], first, true).map((t) => t.id)).toEqual(["z", "a", "c"]);
    expect(placeReplyTemplate([a, c], last, true).map((t) => t.id)).toEqual(["a", "c", "y"]);
  });

  it("takes it out when it doesn't belong", () => {
    expect(placeReplyTemplate([a, c], a, false)).toEqual([c]);
  });

  it("leaves the list alone when it isn't there and doesn't belong", () => {
    expect(placeReplyTemplate([a, c], template("q", "Q"), false)).toEqual([a, c]);
  });
});
