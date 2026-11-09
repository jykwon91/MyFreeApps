// Bounds mirror backend `schemas/listings/listing_create_request.py`.
export const LISTING_TITLE_MAX_LENGTH = 200;
export const LISTING_AMENITY_MAX_LENGTH = 64;
export const LISTING_AMENITIES_MAX_ITEMS = 50;

/** Dollars, with cents only when there are some. */
export const LISTING_RATE_PATTERN = /^\d{1,10}(\.\d{1,2})?$/;
export const LISTING_DAYS_PATTERN = /^\d{1,5}$/;

export const LISTING_FORM_PROBLEMS = {
  propertyRequired: "Pick a property.",
  titleRequired: "Add a title.",
  monthlyRequired: "Add the monthly rate.",
  monthlyPositive: "Monthly rate must be greater than 0.",
  rateInvalid: "Enter the rate as dollars, like 1200 or 1200.50.",
  daysInvalid: "Enter a whole number of days, like 30.",
  stayOrder: "The minimum stay can't be longer than the maximum.",
  amenityTooLong: `Each amenity can be at most ${LISTING_AMENITY_MAX_LENGTH} characters.`,
  tooManyAmenities: `You can list at most ${LISTING_AMENITIES_MAX_ITEMS} amenities.`,
} as const;
