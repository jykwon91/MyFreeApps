import { describe, expect, it } from "vitest";
import { SCREENING_QUESTIONS } from "../constants/screeningQuestions";
import { educationDegreeLine } from "../utils/educationDegreeLine";
import { educationYearsLine } from "../utils/educationYearsLine";
import { formatSeniority } from "../utils/formatSeniority";
import { formatWorkAuthStatus } from "../utils/formatWorkAuthStatus";
import { formatWorkDateRange } from "../utils/formatWorkDateRange";
import { isRemotePreference } from "../utils/isRemotePreference";
import { isSeniority } from "../utils/isSeniority";
import { isWorkAuthStatus } from "../utils/isWorkAuthStatus";
import { humanizeKey } from "../utils/humanizeKey";
import { screeningQuestionLabel } from "../utils/screeningQuestionLabel";
import { unansweredScreeningQuestions } from "../utils/unansweredScreeningQuestions";

describe("formatWorkDateRange", () => {
  it("shows a current role as running to the present", () => {
    expect(formatWorkDateRange("2021-03-04", null, true)).toBe("Mar 2021 – Present");
  });

  it("shows a past role's months, without letting a time zone move the first of a month", () => {
    expect(formatWorkDateRange("2018-01-01", "2021-02-01", false)).toBe("Jan 2018 – Feb 2021");
  });

  it("says so when a past role has no end date", () => {
    expect(formatWorkDateRange("2018-01-15", null, false)).toBe("Jan 2018 – No end date");
  });
});

describe("formatSeniority", () => {
  it("names a known level, keeps an unknown one, and has nothing for no level", () => {
    expect(formatSeniority("exec")).toBe("Executive level");
    expect(formatSeniority("intern")).toBe("Intern level");
    expect(formatSeniority(null)).toBeNull();
  });
});

describe("formatWorkAuthStatus", () => {
  it("words each known status, and still reads sensibly for an unknown one", () => {
    expect(formatWorkAuthStatus("h1b")).toBe("H-1B");
    expect(formatWorkAuthStatus("permanent_resident")).toBe("Permanent resident");
    expect(formatWorkAuthStatus("unknown")).toBe("Not set");
    expect(formatWorkAuthStatus("tn")).toBe("TN");
    expect(formatWorkAuthStatus("o_1_visa")).toBe("O 1 visa");
  });
});

describe("education lines", () => {
  it("joins the degree and field, either alone, or nothing", () => {
    expect(educationDegreeLine({ degree: "B.S.", field: "Physics" })).toBe("B.S. in Physics");
    expect(educationDegreeLine({ degree: null, field: "Physics" })).toBe("Physics");
    expect(educationDegreeLine({ degree: null, field: null })).toBeNull();
  });

  it("joins the years, either alone, or nothing", () => {
    expect(educationYearsLine({ start_year: 2014, end_year: 2018 })).toBe("2014 – 2018");
    expect(educationYearsLine({ start_year: null, end_year: 2018 })).toBe("2018");
    expect(educationYearsLine({ start_year: null, end_year: null })).toBeNull();
  });
});

describe("screening questions", () => {
  it("labels a known question, and still reads sensibly for an unknown key", () => {
    expect(screeningQuestionLabel("eeoc_gender")).toBe("Gender (EEOC)");
    expect(screeningQuestionLabel("shoe_size")).toBe("Shoe size");
  });

  it("leaves out the questions already answered, and nothing once all are", () => {
    const left = unansweredScreeningQuestions(["work_auth_us", "eeoc_gender"]);
    expect(left).toHaveLength(SCREENING_QUESTIONS.length - 2);
    expect(left.map(({ key }) => key)).not.toContain("eeoc_gender");
    expect(unansweredScreeningQuestions(SCREENING_QUESTIONS.map(({ key }) => key))).toEqual([]);
  });
});

describe("guards", () => {
  it("accepts only the levels and remote preferences the server knows", () => {
    expect(isSeniority("staff")).toBe(true);
    expect(isSeniority("intern")).toBe(false);
    expect(isSeniority(null)).toBe(false);
    expect(isRemotePreference("hybrid")).toBe(true);
    expect(isRemotePreference("sometimes")).toBe(false);
    expect(isWorkAuthStatus("opt")).toBe(true);
    expect(isWorkAuthStatus("toString")).toBe(false);
  });
});

describe("humanizeKey", () => {
  it("capitalizes the first letter and spaces out underscores", () => {
    expect(humanizeKey("phone_screen")).toBe("Phone screen");
    expect(humanizeKey("intern")).toBe("Intern");
  });
});
