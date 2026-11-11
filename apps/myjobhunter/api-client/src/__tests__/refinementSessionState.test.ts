import { describe, expect, it } from "vitest";
import { activeRefinementTarget } from "../utils/activeRefinementTarget";
import { refinementCompletion } from "../utils/refinementCompletion";
import { refinementPreparation } from "../utils/refinementPreparation";
import { improvementTarget, refinementSession } from "./support/refinementSession";

describe("refinementPreparation", () => {
  it("reads the stage from the session alone", () => {
    expect(refinementPreparation(refinementSession({ status: "failed" }))).toEqual({ stage: "failed" });
    expect(refinementPreparation(refinementSession({ status: "preparing", improvement_targets: null }))).toEqual({ stage: "critiquing" });
  });

  it("counts severities most serious first, leaves out empty ones, and caps ready at the total", () => {
    const session = refinementSession({
      status: "preparing",
      improvement_targets: [
        improvementTarget({ severity: "low" }),
        improvementTarget({ severity: "critical" }),
        improvementTarget({ severity: "low" }),
      ],
      proposals_ready_count: 5,
    });
    expect(refinementPreparation(session)).toEqual({
      stage: "drafting",
      total: 3,
      ready: 3,
      severities: [
        { severity: "critical", count: 1 },
        { severity: "low", count: 2 },
      ],
    });
  });
});

describe("refinementCompletion", () => {
  it("stays hidden while targets remain, then tells reviewed, empty and completed apart", () => {
    expect(refinementCompletion(refinementSession())).toBe("hidden");
    expect(refinementCompletion(refinementSession({ target_index: 2 }))).toBe("reviewed");
    expect(refinementCompletion(refinementSession({ improvement_targets: [] }))).toBe("empty");
    expect(refinementCompletion(refinementSession({ status: "completed", target_index: 0 }))).toBe("completed");
  });
});

describe("activeRefinementTarget", () => {
  it("is the current target, or null before the review and once all are through", () => {
    expect(activeRefinementTarget(refinementSession({ target_index: 1 }))?.current_text).toBe("Led a team");
    expect(activeRefinementTarget(refinementSession({ target_index: 2 }))).toBeNull();
    expect(activeRefinementTarget(refinementSession({ improvement_targets: null }))).toBeNull();
  });
});
