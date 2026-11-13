import { describe, expect, it } from "vitest";
import { blankOptOutProblem } from "../blankOptOutProblem";

const PASSED = { status: "passed", expectedStatus: "passed" } as const;

describe("blankOptOutProblem", () => {
  it("refuses an opt-out with no reason", () => {
    expect(blankOptOutProblem(PASSED, "")).toContain("mainLandmarkOptOut needs a reason");
    expect(blankOptOutProblem(PASSED, "  ")).toContain("mainLandmarkOptOut needs a reason");
  });

  it("accepts no opt-out, or one with a reason", () => {
    expect(blankOptOutProblem(PASSED, null)).toBeNull();
    expect(blankOptOutProblem(PASSED, "ends on the raw JSON of a 404 API response")).toBeNull();
  });

  it("adds nothing to a test that already failed, so its own failure is the only one reported", () => {
    expect(blankOptOutProblem({ status: "failed", expectedStatus: "passed" }, " ")).toBeNull();
    expect(blankOptOutProblem({ status: "timedOut", expectedStatus: "passed" }, " ")).toBeNull();
  });

  it("adds nothing to a test.fail() test, whichever way it went", () => {
    expect(blankOptOutProblem({ status: "failed", expectedStatus: "failed" }, " ")).toBeNull();
    expect(blankOptOutProblem({ status: "passed", expectedStatus: "failed" }, " ")).toBeNull();
  });
});
