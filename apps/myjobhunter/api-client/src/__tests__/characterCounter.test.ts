import { describe, expect, it } from "vitest";
import { COMPANY_NAME_MAX_LENGTH } from "../constants/companyFieldLimits";
import { COMPANY_FORM_PROBLEMS } from "../constants/companyFormProblems";
import { companyNameProblem } from "../utils/companyNameProblem";
import { countersFor } from "../utils/countersFor";
import { isPlainEmailAddress } from "../utils/isPlainEmailAddress";

const EMOJI = "😀";

describe("countersFor", () => {
  it("counts the trimmed fields that are near their limit and skips the rest", () => {
    const values = { name: ` ${"a".repeat(95)} `, notes: "short" };
    expect(countersFor(values, { name: 100, notes: 5000 })).toEqual({ name: "95 / 100" });
  });
});

describe("companyNameProblem", () => {
  it("flags a name over the limit, counting an emoji once", () => {
    expect(companyNameProblem("x".repeat(COMPANY_NAME_MAX_LENGTH + 1))).toBe(COMPANY_FORM_PROBLEMS.nameTooLong);
    expect(companyNameProblem(EMOJI.repeat(COMPANY_NAME_MAX_LENGTH))).toBeUndefined();
  });

  it("doesn't call a blank or ordinary name too long", () => {
    expect(companyNameProblem("")).toBeUndefined();
    expect(companyNameProblem("Acme")).toBeUndefined();
  });
});

describe("isPlainEmailAddress", () => {
  it("measures the address in code points", () => {
    expect(isPlainEmailAddress("a@b.co")).toBe(true);
    expect(isPlainEmailAddress(`${EMOJI.repeat(64)}@b.co`)).toBe(true);
    expect(isPlainEmailAddress(`${EMOJI.repeat(65)}@b.co`)).toBe(false);
  });
});
