import { describe, expect, it } from "vitest";
import { fieldProblemAria, fieldProblemId, problemAria } from "@/shared/utils/field-problem-aria";

describe("field-problem-aria", () => {
  it("builds the problem id from prefix and field", () => {
    expect(fieldProblemId("mortgage", "termMonths")).toBe("mortgage-termMonths-problem");
  });

  it("marks a control invalid and points it at the message", () => {
    expect(problemAria("Required", "x-problem")).toEqual({
      "aria-invalid": true,
      "aria-describedby": "x-problem",
    });
  });

  it("adds nothing when there is no problem", () => {
    expect(problemAria(undefined, "x-problem")).toEqual({});
    expect(problemAria("", "x-problem")).toEqual({});
  });

  it("looks the problem up by field", () => {
    const problems = { planName: "Required" };
    expect(fieldProblemAria(problems, "planName", "utility-plan")).toEqual({
      "aria-invalid": true,
      "aria-describedby": "utility-plan-planName-problem",
    });
    expect(fieldProblemAria<"planName" | "avgPrice">(problems, "avgPrice", "utility-plan")).toEqual({});
  });
});
