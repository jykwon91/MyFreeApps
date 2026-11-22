import { describe, expect, it } from "vitest";
import { JOB_ANALYSIS_APPLY_ERRORS } from "../constants/jobAnalysis";
import { describeApplyError } from "../utils/describeApplyError";

describe("describeApplyError", () => {
  it("says the analysis is gone, without offering to try again, for a 404", () => {
    const message = describeApplyError({ status: 404, data: { detail: "Job analysis not found" } });
    expect(message).toBe(JOB_ANALYSIS_APPLY_ERRORS.gone);
    expect(message).not.toContain(JOB_ANALYSIS_APPLY_ERRORS.tryAgain);
  });

  it("gives the server's reason and offers to try again for another error", () => {
    expect(describeApplyError({ status: 500, data: { detail: "boom" } })).toBe(
      "I couldn't add it to your applications (boom). Want to try again?",
    );
  });

  it("offers to try again without a reason when the server gave none", () => {
    expect(describeApplyError(new Error("Network Error"))).toBe("I couldn't add it to your applications. Want to try again?");
  });
});
