import { describe, expect, it } from "vitest";
import { isLeasePropertyNotFoundFailure } from "../utils/isLeasePropertyNotFoundFailure";
import { isListingPropertyMismatchFailure } from "../utils/isListingPropertyMismatchFailure";

describe("isListingPropertyMismatchFailure", () => {
  it("is the 422 with the mismatch code, not another 422", () => {
    expect(isListingPropertyMismatchFailure({ status: 422, data: { detail: { code: "LISTING_PROPERTY_MISMATCH", message: "m" } } })).toBe(true);
    expect(isListingPropertyMismatchFailure({ status: 422, data: { detail: [{ msg: "field required" }] } })).toBe(false);
    expect(isListingPropertyMismatchFailure({ status: 409, data: { detail: { code: "LISTING_PROPERTY_MISMATCH" } } })).toBe(false);
  });
});

describe("isLeasePropertyNotFoundFailure", () => {
  it("is the house's 404, not the tenant's or listing's", () => {
    expect(isLeasePropertyNotFoundFailure({ status: 404, data: { detail: "Property not found" } })).toBe(true);
    expect(isLeasePropertyNotFoundFailure({ status: 404, data: { detail: "Listing not found" } })).toBe(false);
    expect(isLeasePropertyNotFoundFailure(null)).toBe(false);
  });
});
