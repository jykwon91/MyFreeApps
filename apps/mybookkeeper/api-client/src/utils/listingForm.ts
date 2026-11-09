import {
  LISTING_AMENITIES_MAX_ITEMS,
  LISTING_AMENITY_MAX_LENGTH,
  LISTING_DAYS_PATTERN,
  LISTING_FORM_PROBLEMS,
  LISTING_RATE_PATTERN,
} from "../constants/listingForm";
import type { ListingCreateRequest } from "../types/listing/listing-create-request";
import type { ListingFormDirty } from "../types/listing/listing-form-dirty";
import type { ListingFormProblems } from "../types/listing/listing-form-problems";
import type { ListingFormValues } from "../types/listing/listing-form-values";
import type { ListingResponse } from "../types/listing/listing-response";
import type { ListingUpdateRequest } from "../types/listing/listing-update-request";

export const EMPTY_LISTING_FORM: ListingFormValues = {
  property_id: "",
  title: "",
  description: "",
  monthly_rate: "",
  weekly_rate: "",
  nightly_rate: "",
  min_stay_days: "",
  max_stay_days: "",
  room_type: "private_room",
  private_bath: false,
  parking_assigned: false,
  furnished: true,
  status: "draft",
  amenities: "",
  pets_on_premises: false,
  large_dog_disclosure: "",
};

export function parseAmenities(raw: string): string[] {
  return raw
    .split(",")
    .map((amenity) => amenity.trim())
    .filter(Boolean);
}

export function listingToFormValues(listing: ListingResponse): ListingFormValues {
  return {
    property_id: listing.property_id,
    title: listing.title,
    description: listing.description ?? "",
    monthly_rate: String(listing.monthly_rate ?? ""),
    weekly_rate: listing.weekly_rate ? String(listing.weekly_rate) : "",
    nightly_rate: listing.nightly_rate ? String(listing.nightly_rate) : "",
    min_stay_days: listing.min_stay_days != null ? String(listing.min_stay_days) : "",
    max_stay_days: listing.max_stay_days != null ? String(listing.max_stay_days) : "",
    room_type: listing.room_type,
    private_bath: listing.private_bath,
    parking_assigned: listing.parking_assigned,
    furnished: listing.furnished,
    status: listing.status,
    amenities: (listing.amenities ?? []).join(", "),
    pets_on_premises: listing.pets_on_premises,
    large_dog_disclosure: listing.large_dog_disclosure ?? "",
  };
}

export function formValuesToCreateRequest(values: ListingFormValues): ListingCreateRequest {
  return {
    property_id: values.property_id,
    title: values.title.trim(),
    description: values.description.trim() || null,
    monthly_rate: values.monthly_rate.trim(),
    weekly_rate: values.weekly_rate.trim() || null,
    nightly_rate: values.nightly_rate.trim() || null,
    min_stay_days: values.min_stay_days.trim() ? Number(values.min_stay_days) : null,
    max_stay_days: values.max_stay_days.trim() ? Number(values.max_stay_days) : null,
    room_type: values.room_type,
    private_bath: values.private_bath,
    parking_assigned: values.parking_assigned,
    furnished: values.furnished,
    status: values.status,
    amenities: parseAmenities(values.amenities),
    pets_on_premises: values.pets_on_premises,
    large_dog_disclosure: values.large_dog_disclosure.trim() || null,
  };
}

/** Only the touched fields, so an untouched one is never sent as blank and wiped. */
export function formValuesToUpdateRequest(values: ListingFormValues, dirty: ListingFormDirty): ListingUpdateRequest {
  const full = formValuesToCreateRequest(values);
  const out: ListingUpdateRequest = {};
  if (dirty.property_id) out.property_id = full.property_id;
  if (dirty.title) out.title = full.title;
  if (dirty.description) out.description = full.description;
  if (dirty.monthly_rate) out.monthly_rate = full.monthly_rate;
  if (dirty.weekly_rate) out.weekly_rate = full.weekly_rate;
  if (dirty.nightly_rate) out.nightly_rate = full.nightly_rate;
  if (dirty.min_stay_days) out.min_stay_days = full.min_stay_days;
  if (dirty.max_stay_days) out.max_stay_days = full.max_stay_days;
  if (dirty.room_type) out.room_type = full.room_type;
  if (dirty.private_bath) out.private_bath = full.private_bath;
  if (dirty.parking_assigned) out.parking_assigned = full.parking_assigned;
  if (dirty.furnished) out.furnished = full.furnished;
  if (dirty.status) out.status = full.status;
  if (dirty.amenities) out.amenities = full.amenities;
  if (dirty.pets_on_premises) out.pets_on_premises = full.pets_on_premises;
  if (dirty.large_dog_disclosure) out.large_dog_disclosure = full.large_dog_disclosure;
  return out;
}

function sameRate(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return !a && !b;
  return Number(a) === Number(b);
}

/** The fields whose sent value differs from the saved one. "1200" and "1200.00" are the same rate. */
export function listingDirtyFields(values: ListingFormValues, saved: ListingFormValues): ListingFormDirty {
  const sent = formValuesToCreateRequest(values);
  const was = formValuesToCreateRequest(saved);
  const dirty: ListingFormDirty = {};
  const rates = ["monthly_rate", "weekly_rate", "nightly_rate"] as const;
  for (const field of Object.keys(sent) as (keyof ListingFormValues)[]) {
    const differs = (rates as readonly string[]).includes(field)
      ? !sameRate(sent[field as (typeof rates)[number]], was[field as (typeof rates)[number]])
      : JSON.stringify(sent[field]) !== JSON.stringify(was[field]);
    if (differs) dirty[field] = true;
  }
  return dirty;
}

function rateProblem(raw: string): string | undefined {
  const rate = raw.trim();
  return rate && !LISTING_RATE_PATTERN.test(rate) ? LISTING_FORM_PROBLEMS.rateInvalid : undefined;
}

function daysProblem(raw: string): string | undefined {
  const days = raw.trim();
  return days && !LISTING_DAYS_PATTERN.test(days) ? LISTING_FORM_PROBLEMS.daysInvalid : undefined;
}

function amenitiesProblem(raw: string): string | undefined {
  const amenities = parseAmenities(raw);
  if (amenities.length > LISTING_AMENITIES_MAX_ITEMS) return LISTING_FORM_PROBLEMS.tooManyAmenities;
  if (amenities.some((amenity) => amenity.length > LISTING_AMENITY_MAX_LENGTH)) return LISTING_FORM_PROBLEMS.amenityTooLong;
  return undefined;
}

function monthlyProblem(raw: string): string | undefined {
  const rate = raw.trim();
  if (!rate) return LISTING_FORM_PROBLEMS.monthlyRequired;
  if (!LISTING_RATE_PATTERN.test(rate)) return LISTING_FORM_PROBLEMS.rateInvalid;
  return Number(rate) > 0 ? undefined : LISTING_FORM_PROBLEMS.monthlyPositive;
}

export function listingFormProblems(values: ListingFormValues): ListingFormProblems {
  const found: ListingFormProblems = {
    property_id: values.property_id ? undefined : LISTING_FORM_PROBLEMS.propertyRequired,
    title: values.title.trim() ? undefined : LISTING_FORM_PROBLEMS.titleRequired,
    monthly_rate: monthlyProblem(values.monthly_rate),
    weekly_rate: rateProblem(values.weekly_rate),
    nightly_rate: rateProblem(values.nightly_rate),
    min_stay_days: daysProblem(values.min_stay_days),
    max_stay_days: daysProblem(values.max_stay_days),
    amenities: amenitiesProblem(values.amenities),
  };
  const min = values.min_stay_days.trim();
  const max = values.max_stay_days.trim();
  if (!found.min_stay_days && !found.max_stay_days && min && max && Number(min) > Number(max)) {
    found.max_stay_days = LISTING_FORM_PROBLEMS.stayOrder;
  }
  const problems: ListingFormProblems = {};
  for (const field of Object.keys(found) as (keyof ListingFormValues)[]) {
    const problem = found[field];
    if (problem) problems[field] = problem;
  }
  return problems;
}
