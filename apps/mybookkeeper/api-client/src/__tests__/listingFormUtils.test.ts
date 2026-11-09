import { describe, expect, it } from "vitest";
import { LISTING_AMENITIES_MAX_ITEMS, LISTING_AMENITY_MAX_LENGTH, LISTING_FORM_PROBLEMS } from "../constants/listingForm";
import type { ListingFormValues } from "../types/listing/listing-form-values";
import type { ListingResponse } from "../types/listing/listing-response";
import {
  EMPTY_LISTING_FORM,
  formValuesToCreateRequest,
  formValuesToUpdateRequest,
  listingDirtyFields,
  listingFormProblems,
  listingToFormValues,
  parseAmenities,
} from "../utils/listingForm";

const valid: ListingFormValues = { ...EMPTY_LISTING_FORM, property_id: "p1", title: "Room", monthly_rate: "1200" };

const saved = {
  id: "l1",
  property_id: "p1",
  title: "Room",
  description: null,
  monthly_rate: "1200.00",
  weekly_rate: null,
  nightly_rate: "0",
  min_stay_days: 0,
  max_stay_days: null,
  room_type: "private_room",
  private_bath: true,
  parking_assigned: false,
  furnished: true,
  status: "listed",
  amenities: ["wifi", "washer"],
  pets_on_premises: false,
  large_dog_disclosure: null,
} as unknown as ListingResponse;

describe("parseAmenities", () => {
  it("splits on commas, trims and drops blanks", () => {
    expect(parseAmenities(" wifi, ,washer/dryer ,")).toEqual(["wifi", "washer/dryer"]);
    expect(parseAmenities("")).toEqual([]);
  });
});

describe("listingToFormValues", () => {
  it("turns saved values into form text, keeping a zero day count and blanking nulls", () => {
    const values = listingToFormValues(saved);
    expect(values.monthly_rate).toBe("1200.00");
    expect(values.min_stay_days).toBe("0");
    expect(values.max_stay_days).toBe("");
    expect(values.weekly_rate).toBe("");
    expect(values.amenities).toBe("wifi, washer");
    expect(values.description).toBe("");
  });
});

describe("formValuesToCreateRequest", () => {
  it("trims, and sends empty optional fields as null", () => {
    const request = formValuesToCreateRequest({ ...valid, title: " Room ", monthly_rate: " 1200 ", min_stay_days: "30", amenities: "a, b" });
    expect(request).toMatchObject({ title: "Room", monthly_rate: "1200", description: null, weekly_rate: null, min_stay_days: 30, max_stay_days: null, amenities: ["a", "b"] });
  });
});

describe("formValuesToUpdateRequest", () => {
  it("sends only the touched fields", () => {
    expect(formValuesToUpdateRequest({ ...valid, title: "New" }, { title: true })).toEqual({ title: "New" });
    expect(formValuesToUpdateRequest(valid, {})).toEqual({});
  });

  it("sends a cleared optional field as null so it is really cleared", () => {
    expect(formValuesToUpdateRequest({ ...valid, weekly_rate: "" }, { weekly_rate: true })).toEqual({ weekly_rate: null });
  });
});

describe("listingDirtyFields", () => {
  it("is empty when nothing changed, and treats 1200 and 1200.00 as the same rate", () => {
    const base = listingToFormValues(saved);
    expect(listingDirtyFields(base, base)).toEqual({});
    expect(listingDirtyFields({ ...base, monthly_rate: "1200" }, base)).toEqual({});
  });

  it("names the changed fields only", () => {
    const base = listingToFormValues(saved);
    expect(listingDirtyFields({ ...base, title: "Other", amenities: "wifi", private_bath: false }, base)).toEqual({ title: true, amenities: true, private_bath: true });
  });
});

describe("listingFormProblems", () => {
  it("accepts a valid form", () => {
    expect(listingFormProblems(valid)).toEqual({});
  });

  it("requires a property, a title and a monthly rate", () => {
    expect(listingFormProblems(EMPTY_LISTING_FORM)).toEqual({
      property_id: LISTING_FORM_PROBLEMS.propertyRequired,
      title: LISTING_FORM_PROBLEMS.titleRequired,
      monthly_rate: LISTING_FORM_PROBLEMS.monthlyRequired,
    });
  });

  it("rejects an unreadable or non-positive rate, and an unreadable day count", () => {
    expect(listingFormProblems({ ...valid, monthly_rate: "12x" }).monthly_rate).toBe(LISTING_FORM_PROBLEMS.rateInvalid);
    expect(listingFormProblems({ ...valid, monthly_rate: "0" }).monthly_rate).toBe(LISTING_FORM_PROBLEMS.monthlyPositive);
    expect(listingFormProblems({ ...valid, weekly_rate: "1.234" }).weekly_rate).toBe(LISTING_FORM_PROBLEMS.rateInvalid);
    expect(listingFormProblems({ ...valid, min_stay_days: "3.5" }).min_stay_days).toBe(LISTING_FORM_PROBLEMS.daysInvalid);
  });

  it("allows a zero weekly rate but flags a minimum stay longer than the maximum", () => {
    expect(listingFormProblems({ ...valid, weekly_rate: "0" })).toEqual({});
    expect(listingFormProblems({ ...valid, min_stay_days: "60", max_stay_days: "30" }).max_stay_days).toBe(LISTING_FORM_PROBLEMS.stayOrder);
  });

  it("holds amenities to the server's limits", () => {
    const many = Array.from({ length: LISTING_AMENITIES_MAX_ITEMS + 1 }, (_, i) => `a${i}`).join(",");
    expect(listingFormProblems({ ...valid, amenities: many }).amenities).toBe(LISTING_FORM_PROBLEMS.tooManyAmenities);
    expect(listingFormProblems({ ...valid, amenities: "x".repeat(LISTING_AMENITY_MAX_LENGTH + 1) }).amenities).toBe(LISTING_FORM_PROBLEMS.amenityTooLong);
    expect(listingFormProblems({ ...valid, amenities: "x".repeat(LISTING_AMENITY_MAX_LENGTH) })).toEqual({});
  });
});
