import { describe, expect, it } from "vitest";
import { EMPTY_JSEARCH_FORM_VALUES } from "../constants/emptyJSearchFormValues";
import type { Profile } from "../types/profile/profile";
import type { Skill } from "../types/skill/skill";
import type { WorkHistory } from "../types/work-history/work-history";
import { discoveryDefaultsFrom } from "../utils/discoveryDefaultsFrom";
import { discoveryPrefill } from "../utils/discoveryPrefill";
import { recentRoleSuggestions } from "../utils/recentRoleSuggestions";
import { seniorityToExperience } from "../utils/seniorityToExperience";
import { skillSuggestions } from "../utils/skillSuggestions";

function profile(overrides: Partial<Profile> = {}): Profile {
  return { remote_preference: "any", desired_salary_min: null, seniority: null, discovery_defaults: {}, ...overrides } as Profile;
}

describe("discoveryPrefill", () => {
  it("guesses from the profile when no defaults are saved", () => {
    expect(discoveryPrefill(profile({ remote_preference: "remote_only", desired_salary_min: "125000.50", seniority: "Senior" }), ["SRE", "Ops"])).toEqual({
      remoteOnly: true,
      roles: ["SRE"],
      minSalary: "125000",
      experience: "more_than_3_years_experience",
    });
  });

  it("puts saved discovery defaults first", () => {
    const prefill = discoveryPrefill(
      profile({
        seniority: "Senior",
        discovery_defaults: {
          country: "ca",
          date_posted: "today",
          employment_type: "",
          experience: "",
          excluded_industry_chips: ["defense"],
          excluded_keywords: ["clearance"],
        },
      }),
      [],
    );
    expect(prefill).toEqual({
      remoteOnly: false,
      country: "ca",
      datePosted: "today",
      employmentType: "",
      experience: "",
      excludedIndustryChips: ["defense"],
      excludedKeywords: ["clearance"],
    });
  });

  it("skips a salary that isn't a positive number", () => {
    expect(discoveryPrefill(profile({ desired_salary_min: "0" }), [])).not.toHaveProperty("minSalary");
  });
});

describe("seniorityToExperience", () => {
  it("maps seniority to JSearch's experience filter", () => {
    expect(seniorityToExperience("Staff")).toBe("more_than_3_years_experience");
    expect(seniorityToExperience("Entry level")).toBe("no_experience");
    expect(seniorityToExperience("Mid")).toBe("under_3_years_experience");
    expect(seniorityToExperience("Executive")).toBe("");
    expect(seniorityToExperience(null)).toBe("");
  });
});

describe("suggestions", () => {
  it("offers the latest three distinct titles", () => {
    const titles = ["SRE", "SRE", " Backend ", "", "Ops", "Lead"].map((title) => ({ title }) as WorkHistory);
    expect(recentRoleSuggestions(titles)).toEqual(["SRE", "Backend", "Ops"]);
    expect(recentRoleSuggestions(undefined)).toEqual([]);
  });

  it("offers the first eight named skills", () => {
    const skills = ["", " ", ...Array.from({ length: 10 }, (_, i) => `s${i}`)].map((name) => ({ name }) as Skill);
    expect(skillSuggestions(skills)).toEqual(["s0", "s1", "s2", "s3", "s4", "s5", "s6", "s7"]);
  });
});

describe("discoveryDefaultsFrom", () => {
  it("saves this search's filters over the current defaults, keeping the rest", () => {
    expect(discoveryDefaultsFrom({ country: "gb", extra: 1 } as never, { ...EMPTY_JSEARCH_FORM_VALUES, excludedKeywords: ["x"] })).toEqual({
      extra: 1,
      country: "us",
      date_posted: "week",
      employment_type: "FULLTIME",
      experience: "",
      excluded_industry_chips: [],
      excluded_keywords: ["x"],
    });
  });
});
