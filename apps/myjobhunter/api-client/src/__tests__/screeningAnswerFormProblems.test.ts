import { describe, expect, it } from "vitest";
import { SCREENING_ANSWER_MAX_LENGTH } from "../constants/profileFieldLimits";
import { PROFILE_FORM_PROBLEMS } from "../constants/profileFormProblems";
import { screeningAnswerFormProblems } from "../utils/screeningAnswerFormProblems";
import { screeningAnswerProblem } from "../utils/screeningAnswerProblem";

describe("screeningAnswerProblem", () => {
  it("allows a blank answer and one at the limit, after trimming", () => {
    expect(screeningAnswerProblem("")).toBeUndefined();
    expect(screeningAnswerProblem(` ${"a".repeat(SCREENING_ANSWER_MAX_LENGTH)} `)).toBeUndefined();
  });

  it("says an answer over the limit is too long", () => {
    expect(screeningAnswerProblem("a".repeat(SCREENING_ANSWER_MAX_LENGTH + 1))).toBe("Keep this to 5,000 characters or fewer.");
  });
});

describe("screeningAnswerFormProblems", () => {
  it("is empty when a question is chosen and the answer fits", () => {
    expect(screeningAnswerFormProblems({ question_key: "work_auth_us", answer: "Yes" })).toEqual({});
  });

  it("asks for a question and names a too-long answer", () => {
    expect(screeningAnswerFormProblems({ question_key: "", answer: "a".repeat(SCREENING_ANSWER_MAX_LENGTH + 1) })).toEqual({
      question_key: PROFILE_FORM_PROBLEMS.questionRequired,
      answer: "Keep this to 5,000 characters or fewer.",
    });
  });
});
