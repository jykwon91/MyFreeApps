import type { InquirySource } from "../types/inquiry/inquiry-source";

/** A host-entered inquiry: someone who called, texted or wrote outside the listing sites. The only source without a platform ID. */
export const INQUIRY_DIRECT_SOURCE: InquirySource = "direct";

/** The form's local date-time shape, the same as an HTML datetime-local input. */
export const INQUIRY_RECEIVED_AT_FORMAT = "yyyy-MM-dd'T'HH:mm";

/** The backend's ``InquiryCreateRequest`` length caps, so a field stops taking text where the server would refuse it. */
export const INQUIRY_FIELD_MAX_LENGTH = {
  externalId: 100,
  name: 255,
  email: 255,
  phone: 50,
  employer: 255,
  notes: 5000,
} as const;

export const INQUIRY_FORM_LABELS = {
  title: "New inquiry",
  intro: "Log an inquiry that came in outside Furnished Finder or Travel Nurse Housing — or a backdated one you want to track.",
  source: "Source",
  name: "Inquirer name",
  email: "Email",
  phone: "Phone",
  employer: "Employer / hospital",
  startDate: "Desired start date",
  endDate: "Desired end date",
  listing: "Listing",
  noListing: "Not yet linked",
  receivedAt: "Received at",
  notes: "Notes",
} as const;

export const INQUIRY_FORM_PLACEHOLDERS = {
  externalId: "e.g. I-12345",
  employer: "e.g. Texas Children's Hospital",
} as const;

/** Mirrors the backend ``InquiryCreateRequest`` rules, plus the name the form asks for. */
export const INQUIRY_FORM_PROBLEMS = {
  externalIdRequired: "Required for non-direct inquiries",
  nameRequired: "Name is required",
  endBeforeStart: "End date must be on or after start date",
  receivedAtRequired: "Received-at is required",
} as const;
