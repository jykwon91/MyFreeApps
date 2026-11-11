import { describe, expect, it } from "vitest";
import {
  COMPANY_DOMAIN_MAX_LENGTH,
  COMPANY_HQ_LOCATION_MAX_LENGTH,
  COMPANY_INDUSTRY_MAX_LENGTH,
  COMPANY_NAME_MAX_LENGTH,
} from "../constants/companyFieldLimits";
import { COMPANY_FORM_PROBLEMS as PROBLEMS } from "../constants/companyFormProblems";
import { EMPTY_COMPANY_FORM_VALUES } from "../constants/emptyCompanyFormValues";
import type { CompanyFormValues } from "../types/company/company-form-values";
import { companyCreateRequest } from "../utils/companyCreateRequest";
import { companyFormProblems } from "../utils/companyFormProblems";
import { isDuplicateCompanyDomainError } from "../utils/isDuplicateCompanyDomainError";
import { textLength } from "../utils/textLength";

// Two UTF-16 units but one code point, which is how Pydantic and Postgres count it.
const EMOJI = "🚀";

function form(values: Partial<CompanyFormValues>): CompanyFormValues {
  return { ...EMPTY_COMPANY_FORM_VALUES, ...values };
}

describe("companyFormProblems", () => {
  it("needs a name, spaces alone don't count", () => {
    expect(companyFormProblems(form({}))).toEqual({ name: PROBLEMS.nameRequired });
    expect(companyFormProblems(form({ name: "   " }))).toEqual({ name: PROBLEMS.nameRequired });
    expect(companyFormProblems(form({ name: "Acme" }))).toEqual({});
  });

  it("allows each field up to the backend's limit, measured after trimming", () => {
    expect(
      companyFormProblems(
        form({
          name: ` ${"n".repeat(COMPANY_NAME_MAX_LENGTH)} `,
          primary_domain: "d".repeat(COMPANY_DOMAIN_MAX_LENGTH),
          industry: "i".repeat(COMPANY_INDUSTRY_MAX_LENGTH),
          hq_location: "h".repeat(COMPANY_HQ_LOCATION_MAX_LENGTH),
        }),
      ),
    ).toEqual({});
  });

  it("counts an emoji as one character, as the backend does", () => {
    expect(EMOJI.length).toBe(2);
    expect(textLength(EMOJI)).toBe(1);
    const atLimit = form({
      name: EMOJI.repeat(COMPANY_NAME_MAX_LENGTH),
      primary_domain: EMOJI.repeat(COMPANY_DOMAIN_MAX_LENGTH),
      industry: EMOJI.repeat(COMPANY_INDUSTRY_MAX_LENGTH),
      hq_location: EMOJI.repeat(COMPANY_HQ_LOCATION_MAX_LENGTH),
    });
    expect(companyFormProblems(atLimit)).toEqual({});
    expect(companyFormProblems({ ...atLimit, name: EMOJI.repeat(COMPANY_NAME_MAX_LENGTH + 1) })).toEqual({ name: PROBLEMS.nameTooLong });
  });

  it("says which fields are over the backend's limit", () => {
    expect(
      companyFormProblems(
        form({
          name: "n".repeat(COMPANY_NAME_MAX_LENGTH + 1),
          primary_domain: "d".repeat(COMPANY_DOMAIN_MAX_LENGTH + 1),
          industry: "i".repeat(COMPANY_INDUSTRY_MAX_LENGTH + 1),
          hq_location: "h".repeat(COMPANY_HQ_LOCATION_MAX_LENGTH + 1),
        }),
      ),
    ).toEqual({
      name: PROBLEMS.nameTooLong,
      primary_domain: PROBLEMS.domainTooLong,
      industry: PROBLEMS.industryTooLong,
      hq_location: PROBLEMS.hqLocationTooLong,
    });
  });
});

describe("companyCreateRequest", () => {
  it("trims every field and sends blank optional fields as null", () => {
    expect(companyCreateRequest(form({ name: "  Acme  ", primary_domain: " ", industry: "", hq_location: " SF " }))).toEqual({
      name: "Acme",
      primary_domain: null,
      industry: null,
      hq_location: "SF",
    });
  });
});

describe("isDuplicateCompanyDomainError", () => {
  it("is the server's 409 and nothing else", () => {
    expect(isDuplicateCompanyDomainError({ status: 409, data: { detail: "exists" } })).toBe(true);
    expect(isDuplicateCompanyDomainError({ status: 422 })).toBe(false);
    expect(isDuplicateCompanyDomainError(new Error("network"))).toBe(false);
  });
});
