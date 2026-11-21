import { describe, it, expect } from "vitest";
import { applicationRowLabel } from "@/lib/applicationRowLabel";

describe("applicationRowLabel", () => {
  it("names the role and the company", () => {
    expect(applicationRowLabel({ role_title: "Staff Engineer", company_name: "Acme Corp" })).toBe(
      "Open Staff Engineer at Acme Corp",
    );
  });

  it("names just the role when there is no company", () => {
    expect(applicationRowLabel({ role_title: "Staff Engineer", company_name: null })).toBe("Open Staff Engineer");
    expect(applicationRowLabel({ role_title: "Staff Engineer", company_name: "" })).toBe("Open Staff Engineer");
  });
});
