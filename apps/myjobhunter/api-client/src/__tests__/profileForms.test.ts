import { describe, expect, it } from "vitest";
import {
  EDUCATION_SCHOOL_MAX_LENGTH,
  SKILL_NAME_MAX_LENGTH,
  WORK_HISTORY_BULLET_MAX_LENGTH,
  WORK_HISTORY_BULLETS_MAX_COUNT,
} from "../constants/profileFieldLimits";
import { PROFILE_FORM_PROBLEMS as PROBLEMS } from "../constants/profileFormProblems";
import type { EducationFormValues } from "../types/education/education-form-values";
import type { WorkHistoryFormValues } from "../types/work-history/work-history-form-values";
import { educationFormProblems } from "../utils/educationFormProblems";
import { educationFormValues } from "../utils/educationFormValues";
import { educationRequest } from "../utils/educationRequest";
import { skillCreateRequest } from "../utils/skillCreateRequest";
import { skillNameProblem } from "../utils/skillNameProblem";
import { workHistoryFormProblems } from "../utils/workHistoryFormProblems";
import { workHistoryFormValues } from "../utils/workHistoryFormValues";
import { workHistoryRequest } from "../utils/workHistoryRequest";

const ROLE: WorkHistoryFormValues = {
  company_name: " Acme ",
  title: "Engineer",
  start_date: "2020-01-01",
  end_date: "2021-06-30",
  is_current: false,
  bullets: "Shipped it\n\n  Fixed it  ",
};
const SCHOOL: EducationFormValues = { school: "State", degree: "", field: " Physics ", start_year: "2014", end_year: "2018", gpa: "3.85" };

describe("work history form", () => {
  it("starts blank for a new role, and from the saved role for an edit", () => {
    expect(workHistoryFormValues()).toEqual({ company_name: "", title: "", start_date: "", end_date: "", is_current: false, bullets: "" });
    expect(
      workHistoryFormValues({
        id: "wh-1",
        user_id: "u1",
        profile_id: "p1",
        company_name: "Acme",
        title: "Engineer",
        start_date: "2020-01-01",
        end_date: null,
        is_current: true,
        bullets: ["One", "Two"],
        created_at: "",
        updated_at: "",
      }),
    ).toEqual({ company_name: "Acme", title: "Engineer", start_date: "2020-01-01", end_date: "", is_current: true, bullets: "One\nTwo" });
  });

  it("trims what is sent, one bullet per non-blank line", () => {
    expect(workHistoryRequest(ROLE)).toEqual({
      company_name: "Acme",
      title: "Engineer",
      start_date: "2020-01-01",
      end_date: "2021-06-30",
      is_current: false,
      bullets: ["Shipped it", "Fixed it"],
    });
  });

  it("sends no end date for a current role, or for a blank one", () => {
    expect(workHistoryRequest({ ...ROLE, is_current: true }).end_date).toBeNull();
    expect(workHistoryRequest({ ...ROLE, end_date: "" }).end_date).toBeNull();
  });

  it("has no problems with a complete role", () => {
    expect(workHistoryFormProblems(ROLE)).toEqual({});
  });

  it("asks for the company, title and start date", () => {
    expect(workHistoryFormProblems({ ...ROLE, company_name: "  ", title: "", start_date: "" })).toEqual({
      company_name: PROBLEMS.companyRequired,
      title: PROBLEMS.titleRequired,
      start_date: PROBLEMS.startDateRequired,
    });
  });

  it("catches an end before the start, but not for a current role", () => {
    const backwards = { ...ROLE, start_date: "2022-01-02", end_date: "2022-01-01" };
    expect(workHistoryFormProblems(backwards)).toEqual({ end_date: PROBLEMS.endBeforeStart });
    expect(workHistoryFormProblems({ ...backwards, is_current: true })).toEqual({});
    expect(workHistoryFormProblems({ ...ROLE, end_date: ROLE.start_date })).toEqual({});
  });

  it("limits how many bullets there are, and how long each is", () => {
    const many = Array.from({ length: WORK_HISTORY_BULLETS_MAX_COUNT + 1 }, (_, index) => `Bullet ${index}`).join("\n");
    expect(workHistoryFormProblems({ ...ROLE, bullets: many })).toEqual({ bullets: PROBLEMS.tooManyBullets });
    expect(workHistoryFormProblems({ ...ROLE, bullets: "x".repeat(WORK_HISTORY_BULLET_MAX_LENGTH + 1) })).toEqual({ bullets: PROBLEMS.bulletTooLong });
    expect(workHistoryFormProblems({ ...ROLE, bullets: "x".repeat(WORK_HISTORY_BULLET_MAX_LENGTH) })).toEqual({});
  });
});

describe("education form", () => {
  it("starts blank for a new school, and from the saved school for an edit", () => {
    expect(educationFormValues()).toEqual({ school: "", degree: "", field: "", start_year: "", end_year: "", gpa: "" });
    expect(
      educationFormValues({
        id: "ed-1",
        user_id: "u1",
        profile_id: "p1",
        school: "State",
        degree: null,
        field: "Physics",
        start_year: 2014,
        end_year: null,
        gpa: "3.80",
        created_at: "",
        updated_at: "",
      }),
    ).toEqual({ school: "State", degree: "", field: "Physics", start_year: "2014", end_year: "", gpa: "3.80" });
  });

  it("sends blanks as null and years as numbers", () => {
    expect(educationRequest(SCHOOL)).toEqual({ school: "State", degree: null, field: "Physics", start_year: 2014, end_year: 2018, gpa: "3.85" });
    expect(educationRequest({ ...SCHOOL, start_year: " ", gpa: "" })).toEqual(expect.objectContaining({ start_year: null, gpa: null }));
  });

  it("has no problems with a complete school, or one with only its name", () => {
    expect(educationFormProblems(SCHOOL)).toEqual({});
    expect(educationFormProblems({ ...educationFormValues(), school: "State" })).toEqual({});
  });

  it("asks for the school, and limits its length", () => {
    expect(educationFormProblems({ ...SCHOOL, school: " " })).toEqual({ school: PROBLEMS.schoolRequired });
    expect(educationFormProblems({ ...SCHOOL, school: "x".repeat(EDUCATION_SCHOOL_MAX_LENGTH + 1) }).school).toBeDefined();
  });

  it("takes only whole four-digit years in range", () => {
    for (const year of ["1949", "2101", "20.5", "99", "abcd"]) {
      expect(educationFormProblems({ ...SCHOOL, start_year: year, end_year: "" })).toEqual({ start_year: PROBLEMS.year });
    }
    expect(educationFormProblems({ ...SCHOOL, start_year: "1950", end_year: "2100" })).toEqual({});
  });

  it("catches an end year before the start year", () => {
    expect(educationFormProblems({ ...SCHOOL, start_year: "2018", end_year: "2014" })).toEqual({ end_year: PROBLEMS.endYearBeforeStart });
  });

  it("takes a GPA the server can hold: up to two decimals and 9.99", () => {
    for (const gpa of ["3", "3.8", "9.99", "0"]) expect(educationFormProblems({ ...SCHOOL, gpa })).toEqual({});
    for (const gpa of ["3.855", "10", "four", "-1", ".5"]) expect(educationFormProblems({ ...SCHOOL, gpa })).toEqual({ gpa: PROBLEMS.gpa });
  });
});

describe("skill form", () => {
  it("sends the trimmed name and the years as a number, or null when not set", () => {
    expect(skillCreateRequest({ name: " Rust ", years: "10" })).toEqual({ name: "Rust", years_experience: 10, category: null });
    expect(skillCreateRequest({ name: "Rust", years: "" }).years_experience).toBeNull();
  });

  it("asks for a name, catches one already there in any case, and limits the length", () => {
    expect(skillNameProblem("  ", [])).toBe(PROBLEMS.skillRequired);
    expect(skillNameProblem(" typescript ", ["TypeScript"])).toBe(PROBLEMS.skillDuplicate);
    expect(skillNameProblem("x".repeat(SKILL_NAME_MAX_LENGTH + 1), [])).toBeDefined();
    expect(skillNameProblem("Rust", ["TypeScript"])).toBeUndefined();
  });
});
