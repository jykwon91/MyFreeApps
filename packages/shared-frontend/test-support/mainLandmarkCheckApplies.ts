import type { TestInfo } from "@playwright/test";

/**
 * Whether the crash guard checks a finished test's main landmarks. Only a
 * test that passed and was meant to pass: a test that already failed keeps
 * its own failure as the one reported, and a `test.fail()` test must never
 * fail "as expected" because of this check instead of the thing it tests.
 * A spec opts out with `mainLandmarkOptOut` (blankOptOutProblem checks its reason).
 */
export function mainLandmarkCheckApplies(
  { status, expectedStatus }: Pick<TestInfo, "status" | "expectedStatus">,
  optOut: string | null,
): boolean {
  return optOut === null && status === "passed" && expectedStatus === "passed";
}
