import { describe, it, expect } from "vitest";
import { withReturnTo } from "../utils/withReturnTo";

describe("withReturnTo", () => {
  it("adds an encoded returnTo", () => {
    expect(withReturnTo("/register", "/practice?scenario=cafe")).toBe(
      "/register?returnTo=%2Fpractice%3Fscenario%3Dcafe",
    );
  });

  it("leaves the path alone when there's nowhere to return to", () => {
    expect(withReturnTo("/register", null)).toBe("/register");
    expect(withReturnTo("/register", "")).toBe("/register");
  });
});
