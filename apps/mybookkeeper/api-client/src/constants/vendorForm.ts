// Bounds mirror the String() lengths on the backend Vendor model.
export const VENDOR_NAME_MAX_LENGTH = 255;
export const VENDOR_PHONE_MAX_LENGTH = 50;
export const VENDOR_EMAIL_MAX_LENGTH = 255;
export const VENDOR_ADDRESS_MAX_LENGTH = 500;

/** Dollars, with cents only when there are some. */
export const VENDOR_HOURLY_RATE_PATTERN = /^\d{1,10}(\.\d{1,2})?$/;
export const VENDOR_EMAIL_PATTERN = /^\S+@\S+\.\S+$/;

export const VENDOR_FORM_PROBLEMS = {
  nameRequired: "Add a name.",
  emailInvalid: "That doesn't look like an email address.",
  rateInvalid: "Enter the rate as dollars, like 95 or 95.50.",
} as const;
