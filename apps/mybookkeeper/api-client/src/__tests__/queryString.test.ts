import { describe, expect, it } from "vitest";
import { queryString } from "../utils/queryString";

describe("queryString", () => {
  it("skips what's empty and repeats a key for a list", () => {
    expect(queryString({ start_date: "2026-01-01", end_date: undefined, property_ids: ["a", "b"] })).toBe(
      "start_date=2026-01-01&property_ids=a&property_ids=b",
    );
  });

  it("gives nothing when there's nothing to send", () => {
    expect(queryString({ start_date: "", property_ids: [] })).toBe("");
  });

  it("escapes values", () => {
    expect(queryString({ vendor: "A&B Co" })).toBe("vendor=A%26B%20Co");
  });
});
