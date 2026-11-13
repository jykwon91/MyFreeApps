/** The back-link router state: only an in-app /wow-forever path with a label is ever followed. */
import { describe, expect, it } from "vitest";
import { parseBackLink } from "@/games/wow-forever/lib/shared/backLinkState";

describe("parseBackLink", () => {
  it.each(["/wow-forever", "/wow-forever/guild", "/wow-forever/guild?tab=roster&q=ab", "/wow-forever/guild?me=x#top", "/wow-forever/guild?next=../x", "/wow-forever/a.b/..c"])(
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
    ["wow-forever/guild"],
    ["javascript:alert(1)"],
    ["/wow-forever/../evil"],
    ["/wow-forever/%2e%2e//evil.example"],
    ["/wow-forever/%2E./x"],
    ["/wow-forever/guild\n"],
    [""],
  ])("rejects %s", (backTo) => {
    expect(parseBackLink({ backTo, backLabel: "Back" })).toBeNull();
  });

  it("rejects a missing, non-object, mistyped or label-less state", () => {
    expect(parseBackLink(undefined)).toBeNull();
    expect(parseBackLink(null)).toBeNull();
    expect(parseBackLink("/wow-forever/guild")).toBeNull();
    expect(parseBackLink({})).toBeNull();
    expect(parseBackLink({ backTo: "/wow-forever/guild" })).toBeNull();
    expect(parseBackLink({ backTo: 3, backLabel: "Back" })).toBeNull();
    expect(parseBackLink({ backTo: "/wow-forever/guild", backLabel: 3 })).toBeNull();
    expect(parseBackLink({ backTo: "/wow-forever/guild", backLabel: "" })).toBeNull();
    expect(parseBackLink({ backTo: "/wow-forever/guild", backLabel: "x".repeat(200) })).toBeNull();
  });
});
