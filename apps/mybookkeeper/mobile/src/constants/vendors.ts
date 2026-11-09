export const ALL_CATEGORIES_OPTION = "all";
export const VENDOR_SKELETON_ROWS = ["a", "b", "c", "d", "e", "f"];

export const VENDOR_MESSAGES = {
  loadingList: "Loading your vendors",
  loadingMore: "Loading more vendors",
  loadingOne: "Loading this vendor",
  couldntLoadList: "I couldn't load your vendors.",
  couldntLoadOne: "I couldn't load that vendor.",
  cantFind: "I can't find that vendor.",
  maybeDeleted: "It may have been deleted.",
  tryAgainOffer: "Want me to try again?",
  tryAgain: "Try again",
  back: "Back",
  noneHeading: "You don't have any vendors yet.",
  noneBody: "Add the people you trust, and I'll keep them here for when something breaks.",
  noneViewOnlyBody: "Someone with edit access can add them.",
  add: "Add a vendor",
  clearFilters: "Clear filters",
  tryAnotherFilter: "Try other filters, or see them all.",
  noMatches: "No vendors match those filters.",
  preferred: "Preferred",
  call: "Call",
  directions: "Directions",
  address: "Address",
  hourlyRate: "Hourly rate",
  flatRates: "Flat rates",
  notes: "Notes",
  lastUsed: "Last used",
  neverUsed: "Never used",
  edit: "Edit",
  delete: "Delete",
  deleting: "Deleting…",
  deleted: "Vendor deleted.",
  alreadyDeleted: "That vendor was already deleted.",
  markedPreferred: "Marked as preferred.",
  unmarkedPreferred: "No longer preferred.",
} as const;

export const VENDOR_FILTER_MESSAGES = {
  button: "Filters",
  title: "Filter vendors",
  preferredOnly: "Preferred only",
  preferredNote: "Only the vendors you've starred.",
  category: "Category",
  allCategories: "All categories",
  done: "Show vendors",
  clear: "Clear filters",
} as const;

export function deleteVendorTitle(name: string): string {
  return `Delete ${name}?`;
}

export const DELETE_VENDOR_BODY =
  "It will be removed from your list. Any transactions you've already linked to them stay put, but won't be tagged with this vendor anymore. This can't be undone.";
