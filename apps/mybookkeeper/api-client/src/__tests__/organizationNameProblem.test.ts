import { describe, it, expect } from "vitest";
import { ORGANIZATION_NAME_MAX_LENGTH } from "../constants/organizationName";
import { organizationNameProblem } from "../utils/organizationNameProblem";

describe("organizationNameProblem", () => {
  it("needs something besides spaces", () => {
    expect(organizationNameProblem("")).toBe("required");
    expect(organizationNameProblem("   ")).toBe("required");
  });

  it("takes a name up to the column's length, judged trimmed", () => {
    expect(organizationNameProblem("My Properties LLC")).toBeNull();
    expect(organizationNameProblem(`  ${"a".repeat(ORGANIZATION_NAME_MAX_LENGTH)}  `)).toBeNull();
    expect(organizationNameProblem("a".repeat(ORGANIZATION_NAME_MAX_LENGTH + 1))).toBe("tooLong");
  });
});
