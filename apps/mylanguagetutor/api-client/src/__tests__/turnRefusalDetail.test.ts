import { describe, expect, it } from "vitest";
import { turnRefusalDetail } from "../utils/turnRefusalDetail";

describe("turnRefusalDetail", () => {
  it("returns the backend's string detail", () => {
    expect(turnRefusalDetail(429, { detail: "daily_limit_reached" })).toBe("daily_limit_reached");
  });

  it("falls back to http_<status> when the body isn't JSON", () => {
    expect(turnRefusalDetail(502, undefined)).toBe("http_502");
  });

  it("falls back when detail is missing or not a string", () => {
    expect(turnRefusalDetail(422, { detail: [{ msg: "too long" }] })).toBe("http_422");
    expect(turnRefusalDetail(500, { error: "boom" })).toBe("http_500");
    expect(turnRefusalDetail(500, null)).toBe("http_500");
    expect(turnRefusalDetail(500, "detail")).toBe("http_500");
  });
});
