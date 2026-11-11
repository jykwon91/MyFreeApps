import { describe, expect, it } from "vitest";
import {
  ADD_APPLICATION_FORM_PROBLEMS as PROBLEMS,
  JD_TEXT_MAX_LENGTH,
  JOB_URL_MAX_LENGTH,
} from "../constants/addApplicationForm";
import { INTERVIEWER_NAME_MAX_LENGTH, INTERVIEWERS_MAX } from "../constants/interviewDetailLimits";
import { interviewerNameTooLongMessage, tooManyInterviewersMessage } from "../constants/interviewerProblems";
import { emptyFormValues } from "../utils/interviewEventForm";
import { eventTextProblems } from "../utils/eventTextProblems";
import { interviewerNamesProblem } from "../utils/interviewerNamesProblem";
import { jobDescriptionLengthProblem, jobLinkLengthProblem } from "../utils/jobSourceProblems";

const EMOJI = "😀";

describe("jobLinkLengthProblem", () => {
  it("accepts a link at the limit, counting an emoji once, and flags one more", () => {
    expect(jobLinkLengthProblem(`https://x.co/${"a".repeat(JOB_URL_MAX_LENGTH - 13)}`)).toBeUndefined();
    expect(jobLinkLengthProblem(EMOJI.repeat(JOB_URL_MAX_LENGTH))).toBeUndefined();
    expect(jobLinkLengthProblem(EMOJI.repeat(JOB_URL_MAX_LENGTH + 1))).toBe(PROBLEMS.jobUrlTooLong);
  });

  it("measures what is sent, trimmed", () => {
    expect(jobLinkLengthProblem(` ${"a".repeat(JOB_URL_MAX_LENGTH)} `)).toBeUndefined();
  });
});

describe("jobDescriptionLengthProblem", () => {
  it("accepts text at the limit and flags one more, counting code points", () => {
    expect(jobDescriptionLengthProblem(EMOJI.repeat(JD_TEXT_MAX_LENGTH))).toBeUndefined();
    expect(jobDescriptionLengthProblem(EMOJI.repeat(JD_TEXT_MAX_LENGTH + 1))).toBe(PROBLEMS.jdTextTooLong);
  });
});

describe("interviewerNamesProblem", () => {
  it("accepts up to the limit of names, blank lines ignored", () => {
    const names = Array.from({ length: INTERVIEWERS_MAX }, (_, i) => `Person ${i}`).join("\n\n");
    expect(interviewerNamesProblem(names)).toBeUndefined();
    expect(interviewerNamesProblem("")).toBeUndefined();
  });

  it("flags too many names", () => {
    const names = Array.from({ length: INTERVIEWERS_MAX + 1 }, (_, i) => `Person ${i}`).join("\n");
    expect(interviewerNamesProblem(names)).toBe(tooManyInterviewersMessage(INTERVIEWERS_MAX));
  });

  it("counts a name in code points: emoji up to the limit fit, one more doesn't", () => {
    expect(interviewerNamesProblem(EMOJI.repeat(INTERVIEWER_NAME_MAX_LENGTH))).toBeUndefined();
    expect(interviewerNamesProblem(EMOJI.repeat(INTERVIEWER_NAME_MAX_LENGTH + 1))).toBe(
      interviewerNameTooLongMessage(INTERVIEWER_NAME_MAX_LENGTH),
    );
  });
});

describe("eventTextProblems interviewer names", () => {
  const tooMany = Array.from({ length: INTERVIEWERS_MAX + 1 }, (_, i) => `P${i}`).join("\n");

  it("flags them only when the interview fields are shown", () => {
    const values = { ...emptyFormValues(), interview_interviewer_names: tooMany };
    expect(eventTextProblems(values, false)).toEqual({});
    expect(eventTextProblems(values, true)).toEqual({
      interview_interviewer_names: tooManyInterviewersMessage(INTERVIEWERS_MAX),
    });
  });
});
