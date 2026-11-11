import { describe, expect, it } from "vitest";
import { COMPANY_NAME_MAX_LENGTH } from "../constants/companyFieldLimits";
import { COMPANY_FORM_PROBLEMS } from "../constants/companyFormProblems";
import { characterCounter } from "../utils/characterCounter";
import { companyNameProblem } from "../utils/companyNameProblem";
import { countersFor } from "../utils/countersFor";
import { isPlainEmailAddress } from "../utils/isPlainEmailAddress";
import { textLength } from "../utils/textLength";

const EMOJI = "😀";

describe("textLength", () => {
  it("counts code points, not UTF-16 units", () => {
    expect(textLength("")).toBe(0);
    expect(textLength("abc")).toBe(3);
    expect(textLength(EMOJI.repeat(4))).toBe(4);
  });
});

describe("characterCounter", () => {
  it("is silent while the value is well within the limit", () => {
    expect(characterCounter("a".repeat(100), 5000)).toBeUndefined();
  });

  it("shows the count against the limit near it and over it", () => {
    expect(characterCounter("a".repeat(4500), 5000)).toBe("4,500 / 5,000");
    expect(characterCounter("a".repeat(5100), 5000)).toBe("5,100 / 5,000");
  });

  it("counts an emoji once", () => {
    expect(characterCounter(EMOJI.repeat(90), 100)).toBe("90 / 100");
  });
});

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
