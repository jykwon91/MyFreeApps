import { describe, it, expect } from "vitest";
import { hasHttpStatus } from "@/shared/utils/http-status";

describe("hasHttpStatus", () => {
  it("matches an error with that status", () => {
    expect(hasHttpStatus({ status: 409, data: { detail: "exists" } }, 409)).toBe(true);
  });

  it("does not match another status, a fetch error or a non-object", () => {
    expect(hasHttpStatus({ status: 500 }, 409)).toBe(false);
    expect(hasHttpStatus({ status: "FETCH_ERROR", error: "offline" }, 409)).toBe(false);
    expect(hasHttpStatus(new Error("boom"), 409)).toBe(false);
    expect(hasHttpStatus(null, 409)).toBe(false);
    expect(hasHttpStatus("409", 409)).toBe(false);
  });
});
