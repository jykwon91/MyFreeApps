import { describe, expect, it } from "vitest";
import { sameFormValues } from "../utils/sameFormValues";

describe("sameFormValues", () => {
  it("is true when every field holds the same value", () => {
    expect(sameFormValues({ name: "Ada", years: "3" }, { name: "Ada", years: "3" })).toBe(true);
  });

  it("is false when any field differs", () => {
    expect(sameFormValues({ name: "Ada", years: "3" }, { name: "Ada", years: "4" })).toBe(false);
  });

  it("compares objects inside a field by identity, so an untouched one stays the same", () => {
    const tags = ["a"];
    expect(sameFormValues({ tags }, { tags })).toBe(true);
    expect(sameFormValues({ tags }, { tags: ["a"] })).toBe(false);
  });
});
