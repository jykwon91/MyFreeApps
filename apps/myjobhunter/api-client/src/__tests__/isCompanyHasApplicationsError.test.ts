import { describe, expect, it } from "vitest";
import { isCompanyHasApplicationsError } from "../utils/isCompanyHasApplicationsError";

const coded = {
  status: 409,
  data: { detail: { code: "COMPANY_HAS_APPLICATIONS", message: "Still has 2 applications.", application_count: 2 } },
};

describe("isCompanyHasApplicationsError", () => {
  it("accepts the coded 409", () => {
    expect(isCompanyHasApplicationsError(coded)).toBe(true);
  });

  it("rejects a 409 with a different code", () => {
    const other = { status: 409, data: { detail: { ...coded.data.detail, code: "SOMETHING_ELSE" } } };
    expect(isCompanyHasApplicationsError(other)).toBe(false);
  });

  it("rejects the right code on a different status", () => {
    expect(isCompanyHasApplicationsError({ ...coded, status: 500 })).toBe(false);
  });

  it("rejects a plain-string 409 detail", () => {
    expect(isCompanyHasApplicationsError({ status: 409, data: { detail: "duplicate" } })).toBe(false);
  });

  it("rejects a malformed detail", () => {
    const bad = { status: 409, data: { detail: { code: "COMPANY_HAS_APPLICATIONS", message: "x" } } };
    expect(isCompanyHasApplicationsError(bad)).toBe(false);
  });

  it("rejects non-objects", () => {
    expect(isCompanyHasApplicationsError(null)).toBe(false);
    expect(isCompanyHasApplicationsError("409")).toBe(false);
    expect(isCompanyHasApplicationsError(undefined)).toBe(false);
  });
});
