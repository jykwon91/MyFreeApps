import { describe, it, expect } from "vitest";
import { resolveLoginDestination } from "../utils/resolveLoginDestination";

describe("resolveLoginDestination", () => {
  it("prefers the page RequireAuth sent the visitor from", () => {
    expect(resolveLoginDestination({ from: "/recipes?x=1" }, "/other", "/")).toBe("/recipes?x=1");
  });

  it("uses the returnTo query when there is no router state", () => {
    expect(resolveLoginDestination(null, "/practice", "/")).toBe("/practice");
    expect(resolveLoginDestination({}, "/practice", "/")).toBe("/practice");
  });

  it("falls back to home when neither is given", () => {
    expect(resolveLoginDestination(null, null, "/dashboard")).toBe("/dashboard");
    expect(resolveLoginDestination(undefined, "", "/dashboard")).toBe("/dashboard");
  });

  it("ignores an off-site router state and falls through to a safe returnTo", () => {
    expect(resolveLoginDestination({ from: "https://evil.example" }, "/practice", "/")).toBe("/practice");
  });

  it.each(["https://evil.example", "//evil.example", "/\\evil.example", "/\t/evil.example", "evil"])(
    "falls back to home for %j in both places",
    (bad) => {
      expect(resolveLoginDestination({ from: bad }, bad, "/dashboard")).toBe("/dashboard");
    },
  );
});
