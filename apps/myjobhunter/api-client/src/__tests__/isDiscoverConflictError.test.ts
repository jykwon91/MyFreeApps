import { describe, expect, it } from "vitest";
import { DISCOVER_CONFLICT_CODES } from "../constants/discoverConflictCodes";
import { isDiscoverConflictError } from "../utils/isDiscoverConflictError";

const coded = (code: string) => ({ status: 409, data: { detail: { code, message: "The server's wording" } } });

describe("isDiscoverConflictError", () => {
  it("accepts each coded 409", () => {
    expect(isDiscoverConflictError(coded(DISCOVER_CONFLICT_CODES.alreadyApplied))).toBe(true);
    expect(isDiscoverConflictError(coded(DISCOVER_CONFLICT_CODES.duplicate))).toBe(true);
    expect(isDiscoverConflictError(coded(DISCOVER_CONFLICT_CODES.noLongerListed))).toBe(true);
  });

  it("rejects a 409 with another code", () => {
    expect(isDiscoverConflictError(coded("COMPANY_HAS_APPLICATIONS"))).toBe(false);
  });

  it("rejects the right code on a different status", () => {
    expect(isDiscoverConflictError({ ...coded(DISCOVER_CONFLICT_CODES.duplicate), status: 500 })).toBe(false);
  });

  it("rejects a plain-string 409 detail", () => {
    expect(isDiscoverConflictError({ status: 409, data: { detail: "This posting is already in your Applications" } })).toBe(false);
  });

  it("rejects a detail without a message, and anything that isn't an error object", () => {
    expect(isDiscoverConflictError({ status: 409, data: { detail: { code: DISCOVER_CONFLICT_CODES.duplicate } } })).toBe(false);
    expect(isDiscoverConflictError(null)).toBe(false);
    expect(isDiscoverConflictError(new Error("network"))).toBe(false);
  });
});
