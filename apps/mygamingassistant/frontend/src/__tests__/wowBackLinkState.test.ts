/** The back-link router state: only an in-app /wow-forever path with a label is ever followed. */
import { describe, expect, it } from "vitest";
import { parseBackLink } from "@/games/wow-forever/lib/shared/backLinkState";

describe("parseBackLink", () => {
  it.each(["/wow-forever", "/wow-forever/topdeadcenter", "/wow-forever/topdeadcenter?tab=roster&q=ab", "/wow-forever/topdeadcenter?me=x#top", "/wow-forever/topdeadcenter?next=../x", "/wow-forever/a.b/..c"])(
    "accepts %s",
    (backTo) => {
      expect(parseBackLink({ backTo, backLabel: "Back to topdeadcenter" })).toEqual({ backTo, backLabel: "Back to topdeadcenter" });
    },
  );

  it.each([
    ["https://evil.example/wow-forever"],
    ["//evil.example"],
    ["//wow-forever"],
    ["/\\evil.example"],
    ["/wow-forever\\evil"],
    ["/wow-forevermore"],
    ["/other/page"],
    ["wow-forever/topdeadcenter"],
    ["javascript:alert(1)"],
    ["/wow-forever/../evil"],
    ["/wow-forever/%2e%2e//evil.example"],
    ["/wow-forever/%2E./x"],
    ["/wow-forever/topdeadcenter\n"],
    [""],
  ])("rejects %s", (backTo) => {
    expect(parseBackLink({ backTo, backLabel: "Back" })).toBeNull();
  });

  it("rejects a missing, non-object, mistyped or label-less state", () => {
    expect(parseBackLink(undefined)).toBeNull();
    expect(parseBackLink(null)).toBeNull();
    expect(parseBackLink("/wow-forever/topdeadcenter")).toBeNull();
    expect(parseBackLink({})).toBeNull();
    expect(parseBackLink({ backTo: "/wow-forever/topdeadcenter" })).toBeNull();
    expect(parseBackLink({ backTo: 3, backLabel: "Back" })).toBeNull();
    expect(parseBackLink({ backTo: "/wow-forever/topdeadcenter", backLabel: 3 })).toBeNull();
    expect(parseBackLink({ backTo: "/wow-forever/topdeadcenter", backLabel: "" })).toBeNull();
    expect(parseBackLink({ backTo: "/wow-forever/topdeadcenter", backLabel: "x".repeat(200) })).toBeNull();
  });
});
