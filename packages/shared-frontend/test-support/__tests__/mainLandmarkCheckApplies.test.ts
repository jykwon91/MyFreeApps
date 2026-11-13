import { describe, expect, it } from "vitest";
import { mainLandmarkCheckApplies } from "../mainLandmarkCheckApplies";

const PASSED = { status: "passed", expectedStatus: "passed" } as const;

describe("mainLandmarkCheckApplies", () => {
  it("checks a test that passed and was meant to", () => {
    expect(mainLandmarkCheckApplies(PASSED, null)).toBe(true);
  });

  it("skips a test that already failed, so its own failure is the one reported", () => {
    expect(mainLandmarkCheckApplies({ status: "failed", expectedStatus: "passed" }, null)).toBe(false);
    expect(mainLandmarkCheckApplies({ status: "timedOut", expectedStatus: "passed" }, null)).toBe(false);
  });

  it("skips a skipped test", () => {
    expect(mainLandmarkCheckApplies({ status: "skipped", expectedStatus: "skipped" }, null)).toBe(false);
  });

  it("skips a test.fail() test, so the check can never be why it fails as expected", () => {
    expect(mainLandmarkCheckApplies({ status: "passed", expectedStatus: "failed" }, null)).toBe(false);
  });

  it("skips a test that opted out with a reason", () => {
    expect(mainLandmarkCheckApplies(PASSED, "ends on the raw JSON of a 404 API response")).toBe(false);
  });
});
