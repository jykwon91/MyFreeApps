// Cached data that embeds a property's name or active state: totals and
// transaction lists hide inactive properties, and other lists show the name.
export const PROPERTY_CHANGE_TAGS = [
  "Property",
  "Summary",
  "Transaction",
  "TaxReturn",
  "Reconciliation",
  "Mortgage",
  "InsurancePolicy",
  "UtilityPlan",
  "Calendar",
] as const;

// Deleting a property also cascade-deletes (or detaches) records that hang off it:
// its listings (and their channel listings, plus the listing link on inquiries and
// leases), and the property link on documents, welcome manuals, classification rules
// and rent reminder schedules.
export const PROPERTY_DELETE_TAGS = [
  ...PROPERTY_CHANGE_TAGS,
  "Listing",
  "ChannelListing",
  "Inquiry",
  "SignedLease",
  "Document",
  "WelcomeManual",
  "ClassificationRule",
  "RentReminder",
] as const;
