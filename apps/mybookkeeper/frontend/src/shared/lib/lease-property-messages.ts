/** Copy for the house (property) a lease records — on the new-lease page, the import dialog and the lease page. */
export const LEASE_PROPERTY_MESSAGES = {
  label: "House",
  hint: "Rent from this tenant is filed under this house.",
  prefilledHint: "Filled in from the listing they inquired about. Rent from this tenant is filed under this house.",
  choose: "— choose a house —",
  required: "Pick the house this lease is for.",
  loadFailed: "I couldn't load your houses. Want me to try again?",
  noHouses: "You don't have any houses yet. Add one under Properties first.",
  cardTitle: "House",
  missingWarning:
    "This lease isn't tied to a house, so rent from this tenant won't be filed under one. Pick the house below.",
  save: "Save house",
  saving: "Saving...",
  saved: "House saved. Rent from this tenant is filed under it now.",
  saveFailed: "Couldn't save the house. Want to try again?",
  propertyNotFound: "I couldn't find that house anymore. Pick another one.",
  listingMismatch: "That listing is for a different house than the one you picked. Pick the listing's house instead.",
} as const;
