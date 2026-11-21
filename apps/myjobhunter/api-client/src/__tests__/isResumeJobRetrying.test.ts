import { describe, expect, it } from "vitest";
import { isResumeJobRetrying } from "../utils/isResumeJobRetrying";

describe("isResumeJobRetrying", () => {
  it("is true only for a queued job that has already failed temporarily", () => {
    expect(isResumeJobRetrying({ status: "queued", retry_count: 2 })).toBe(true);
    expect(isResumeJobRetrying({ status: "queued", retry_count: 0 })).toBe(false);
    expect(isResumeJobRetrying({ status: "processing", retry_count: 2 })).toBe(false);
    expect(isResumeJobRetrying({ status: "failed", retry_count: 5 })).toBe(false);
  });
});
