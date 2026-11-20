import { describe, expect, it } from "vitest";
import { ADD_APPLICATION_FORM_PROBLEMS as PROBLEMS } from "../constants/addApplicationForm";
import type { AddApplicationFormValues } from "../types/application/add-application-form-values";
import type { JdParseResponse } from "../types/application/jd-parse-response";
import { addApplicationFormProblems } from "../utils/addApplicationFormProblems";
import { buildApplicationCreateRequest } from "../utils/buildApplicationCreateRequest";
import { emptyAddApplicationFormValues } from "../utils/emptyAddApplicationFormValues";
import { isSalaryPeriod } from "../utils/isSalaryPeriod";
import { prefillFromParse } from "../utils/prefillFromParse";

const PARSE: JdParseResponse = {
  title: null,
  company: null,
  location: null,
  remote_type: null,
  salary_min: null,
  salary_max: null,
  salary_currency: null,
  salary_period: null,
  seniority: null,
  must_have_requirements: [],
  nice_to_have_requirements: [],
  responsibilities: [],
  summary: null,
};

const CONTEXT = { companyId: "c1", sourceUrl: null, jdText: "" };

function values(overrides: Partial<AddApplicationFormValues>): AddApplicationFormValues {
  return { ...emptyAddApplicationFormValues(), role_title: "Engineer", ...overrides };
}

function salaryOf(form: AddApplicationFormValues) {
  const request = buildApplicationCreateRequest(form, CONTEXT);
  return {
    min: request.posted_salary_min,
    max: request.posted_salary_max,
    period: request.posted_salary_period,
    currency: request.posted_salary_currency,
  };
}

describe("prefillFromParse salary", () => {
  it("fills the salary range, period and currency the posting gives", () => {
    expect(prefillFromParse({ ...PARSE, salary_min: 120000, salary_max: 150000.5, salary_currency: "EUR", salary_period: "annual" })).toEqual({
      posted_salary_min: "120000",
      posted_salary_max: "150000.5",
      posted_salary_currency: "EUR",
      posted_salary_period: "annual",
    });
  });

  it("keeps a zero, fills one end alone, and leaves out what it didn't find", () => {
    expect(prefillFromParse({ ...PARSE, salary_min: 0 })).toEqual({ posted_salary_min: "0" });
    expect(prefillFromParse({ ...PARSE, salary_max: 40 })).toEqual({ posted_salary_max: "40" });
    expect(prefillFromParse(PARSE)).toEqual({});
  });

  it("drops a period the applications table wouldn't take", () => {
    expect(prefillFromParse({ ...PARSE, salary_period: "weekly" })).toEqual({});
  });
});

describe("buildApplicationCreateRequest salary", () => {
  it("sends the reviewed salary as the strings the backend reads", () => {
    expect(
      salaryOf(values({ posted_salary_min: " 120000 ", posted_salary_max: "150000.50", posted_salary_period: "annual", posted_salary_currency: "EUR" })),
    ).toEqual({ min: "120000", max: "150000.50", period: "annual", currency: "EUR" });
  });

  it("sends null, not 0, for a posting with no salary", () => {
    expect(salaryOf(values({}))).toEqual({ min: null, max: null, period: null, currency: "USD" });
  });

  it("sends a parsed posting's salary through unchanged", () => {
    const form = values(prefillFromParse({ ...PARSE, salary_min: 45, salary_max: 60, salary_period: "hourly" }));
    expect(salaryOf(form)).toEqual({ min: "45", max: "60", period: "hourly", currency: "USD" });
  });
});

describe("addApplicationFormProblems salary", () => {
  it("accepts a blank range, one end alone, zero, and an equal top and bottom", () => {
    expect(addApplicationFormProblems(values({}))).toEqual({});
    expect(addApplicationFormProblems(values({ posted_salary_max: "90000" }))).toEqual({});
    expect(addApplicationFormProblems(values({ posted_salary_min: "0", posted_salary_max: "0" }))).toEqual({});
    expect(addApplicationFormProblems(values({ posted_salary_min: "50", posted_salary_max: "50.00" }))).toEqual({});
  });

  it("refuses a top below the bottom, as the backend does", () => {
    expect(addApplicationFormProblems(values({ posted_salary_min: "150000", posted_salary_max: "120000" }))).toEqual({
      posted_salary_max: PROBLEMS.salaryMinAboveMax,
    });
  });

  it("refuses a negative, unreadable, sub-cent or too-large amount", () => {
    expect(addApplicationFormProblems(values({ posted_salary_min: "-5" })).posted_salary_min).toBe(PROBLEMS.salaryNotAnAmount);
    expect(addApplicationFormProblems(values({ posted_salary_min: "lots" })).posted_salary_min).toBe(PROBLEMS.salaryNotAnAmount);
    expect(addApplicationFormProblems(values({ posted_salary_max: "17.555" })).posted_salary_max).toBe(PROBLEMS.salaryNotAnAmount);
    expect(addApplicationFormProblems(values({ posted_salary_max: "10000000000" })).posted_salary_max).toBe(PROBLEMS.salaryTooLarge);
    expect(addApplicationFormProblems(values({ posted_salary_max: "9999999999.99" }))).toEqual({});
  });
});

describe("isSalaryPeriod", () => {
  it("is true only for a period the applications table accepts", () => {
    expect(["annual", "monthly", "hourly"].every(isSalaryPeriod)).toBe(true);
    expect(isSalaryPeriod("")).toBe(false);
    expect(isSalaryPeriod("weekly")).toBe(false);
  });
});
