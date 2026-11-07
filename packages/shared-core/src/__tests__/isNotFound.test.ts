import { describe, expect, it } from "vitest";
import { isNotFound } from "../utils/isNotFound";

describe("isNotFound", () => {
  it("is true only for the API's 404", () => {
    expect(isNotFound({ status: 404, data: { detail: "Not found" } })).toBe(true);
    expect(isNotFound({ status: 500, data: { detail: "Internal Server Error" } })).toBe(false);
    expect(isNotFound({ status: "FETCH_ERROR", error: "TypeError: Failed to fetch" })).toBe(false);
  });

  it("is false when there's no error", () => {
    expect(isNotFound(undefined)).toBe(false);
    expect(isNotFound(null)).toBe(false);
  });
});
