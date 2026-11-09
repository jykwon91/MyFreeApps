export const WELCOME_MANUAL_SKELETON_ROWS = ["a", "b", "c", "d"];

export const WELCOME_MANUAL_MESSAGES = {
  loadingList: "Loading your welcome manuals",
  loadingOne: "Loading this manual",
  loadingMore: "Loading more manuals",
  showMore: "Show more",
  couldntLoadList: "I couldn't load your manuals.",
  couldntLoadOne: "I couldn't load this manual.",
  cantFind: "I can't find that manual.",
  maybeDeleted: "It may have been deleted.",
  tryAgainOffer: "Want me to try again?",
  tryAgain: "Try again",
  back: "Back",
  noneHeading: "You don't have any welcome manuals yet.",
  noneBody: "Make one to give guests the Wi-Fi, parking and house rules in one place.",
  noneViewOnlyBody: "Someone with edit access makes them.",
  new: "New manual",
  edit: "Edit details",
  delete: "Delete manual",
  deleting: "Deleting…",
  deleted: "Manual deleted.",
  alreadyDeleted: "That manual was already deleted.",
  noProperty: "No property tagged",
  noSectionsChip: "No sections yet",
  whereToEat: "Where to eat",
  openMap: "Open map",
  sectionsRow: "Sections",
  roomsRow: "Rooms",
  placesRow: "Where to eat",
  shareRow: "Share link and code",
  previewRow: "Preview as a guest",
  emailRow: "Email to a guest",
  shared: "Shared",
  notShared: "Not shared",
  noEmailWithoutSections: "Add a section before emailing the guide.",
  hasStaleData: "I couldn't refresh this, so I'm showing what I loaded earlier.",
} as const;

export function deleteManualTitle(title: string): string {
  return `Delete "${title}"?`;
}

export const DELETE_MANUAL_BODY = "Its sections, photos and share link go with it, for good.";

export function countLabel(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** Which write a welcome-manual item sheet ran last, so its failure copy and spinner match the button pressed. */
export const WELCOME_MANUAL_ITEM_ACTION = { save: "save", remove: "remove" } as const;
