/** Field names the add and edit forms and the detail screen share. */
export const TRANSACTION_FIELD_LABELS = {
  taxYear: "Tax year",
  savedVendor: "Saved vendor",
  channel: "Channel",
  paymentMethod: "Payment method",
  taxRelevant: "Include in tax reports",
  taxReports: "Tax reports",
  scheduleE: "Schedule E line",
} as const;

export const TAX_REPORT_FACT = {
  included: "Included",
  excluded: "Left out",
} as const;

export const SAVED_VENDOR_MESSAGES = {
  unknown: "A saved vendor",
  loading: "Loading your vendors…",
  sheetDescription: "Link this to one of your saved vendors. None takes the link off.",
  loadFailed: "I couldn't load your saved vendors. Close this and try again.",
} as const;
