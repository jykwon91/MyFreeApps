import { describe, it, expect } from "vitest";
import { uploadOutcome } from "@/shared/utils/upload-outcome";

describe("uploadOutcome", () => {
  it.each([
    ["processing", null],
    ["extracting", null],
    ["completed", "done"],
    ["failed", "failed"],
    ["duplicate", "skipped"],
    ["skipped", "skipped"],
    ["deleted", "skipped"],
  ] as const)("maps %s to %s", (status, outcome) => {
    expect(uploadOutcome(status)).toBe(outcome);
  });
});
