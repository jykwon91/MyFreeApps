import type { TestInfo } from "@playwright/test";
import { mainLandmarkCheckApplies } from "./mainLandmarkCheckApplies";

/**
 * The failure to report when a spec opts out of the main-landmark check with
 * a blank reason, or null. The crash guard reports it alongside any crash, so
 * neither hides the other. A test that already failed (or is a `test.fail()`
 * test) gets null: its own failure is the one reported, never a second one.
 */
export function blankOptOutProblem(
  testInfo: Pick<TestInfo, "status" | "expectedStatus">,
  optOut: string | null,
): string | null {
  if (optOut === null || optOut.trim() !== "" || !mainLandmarkCheckApplies(testInfo, null)) return null;
  return 'mainLandmarkOptOut needs a reason: test.use({ mainLandmarkOptOut: "<why this test ends off an app page>" }).';
}
