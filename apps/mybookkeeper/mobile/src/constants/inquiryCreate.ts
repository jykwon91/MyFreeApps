/** Enough for every listing a host has; the same cap the lease import uses. */
export const INQUIRY_LISTING_CHOICE_LIMIT = 100;

export const INQUIRY_CREATE_MESSAGES = {
  addInquiry: "Add inquiry",
  addHint: "For someone who called, texted or reached you another way",
  save: "Save inquiry",
  saving: "Saving…",
  cancel: "Cancel",
  receivedDate: "Date received",
  receivedTime: "Time received",
  loadingListings: "Loading your listings",
  listingsFailed: "I couldn't load your listings. You can still add the inquiry and link one later.",
  added: (name: string) => `Got it. I added ${name}'s inquiry.`,
  fixFields: "A couple of things need a look before I can add this.",
  offline: "I can't reach the server, so I couldn't add that. Your details are still here.",
  viewOnly: "You have view-only access, so I can't add inquiries.",
  demo: "Demo workspaces can't add inquiries.",
  rejectedFallback: "Something in there isn't right. Check the fields and try again.",
  serverError: "Something went wrong on my side, so I'm not sure it was added. Check your inquiries before trying again, so you don't end up with two.",
  other: "I couldn't add that. Want to try again?",
} as const;
