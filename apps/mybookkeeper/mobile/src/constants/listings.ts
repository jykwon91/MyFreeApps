export const ALL_STATUSES_OPTION = "all";
export const LISTING_SKELETON_ROWS = ["a", "b", "c", "d", "e", "f"];

export const LISTING_MESSAGES = {
  loadingList: "Loading your listings",
  loadingMore: "Loading more listings",
  loadingOne: "Loading this listing",
  couldntLoadList: "I couldn't load your listings.",
  couldntLoadOne: "I couldn't load that listing.",
  cantFind: "I can't find that listing.",
  maybeDeleted: "It may have been deleted.",
  tryAgainOffer: "Want me to try again?",
  tryAgain: "Try again",
  back: "Back",
  noneHeading: "You don't have any listings yet.",
  noneBody: "Add a room or unit, and I'll keep its rates, photos and links here.",
  noneViewOnlyBody: "Someone with edit access can add them.",
  add: "New listing",
  openWebsite: "Open on the website",
  clearFilter: "Clear filter",
  tryAnotherStatus: "Try another status, or see them all.",
  chooseStatus: "Show which status?",
  allStatuses: "All",
  shareLink: "Share inquiry form link",
  shareLinkNote: "Anyone with this link can send you an inquiry.",
  showQr: "Show QR code",
  hideQr: "Hide QR code",
  qrNote: "Show this to a prospective tenant, or print it, so they can open the inquiry form.",
  shareFailed: "I couldn't open sharing on this phone.",
  petsLabel: "Pets on premises",
  petsDefault: "You've said pets live here. Tell anyone who asks about this room.",
  rates: "Rates",
  room: "Room",
  description: "Description",
  monthly: "Monthly",
  weekly: "Weekly",
  nightly: "Nightly",
  stay: "Stay",
  roomType: "Room type",
  privateBath: "Private bath",
  parking: "Parking",
  furnished: "Furnished",
  amenities: "Amenities",
  assigned: "Assigned",
  notAssigned: "Not assigned",
  yes: "Yes",
  no: "No",
  copyLink: "Copy link",
  linkCopied: "Link copied.",
  copyFailed: "I couldn't copy that.",
  property: "Property",
  edit: "Edit listing",
  changeStatus: "Change status",
  chooseNewStatus: "Set the listing's status",
  statusChanged: "Status changed.",
  delete: "Delete listing",
  deleting: "Deleting…",
  deleted: "Listing deleted.",
  alreadyDeleted: "That listing was already deleted.",
  deleteBody: "This removes the listing from your list, along with its photos and links. You can't undo it in the app.",
  photos: "Photos",
  externalLinks: "Other sites",
  channels: "Channels",
  noPhotos: "No photos yet",
  noLinks: "Not linked anywhere",
  couldntCount: "Couldn't load",
} as const;

export function deleteListingTitle(title: string): string {
  return `Delete ${title}?`;
}

export function countText(count: number, one: string, many: string): string {
  return count === 1 ? `1 ${one}` : `${count} ${many}`;
}

export const APPLY_QR_SIZE = 200;
export const APPLY_QR_PADDING = 12;
/** A QR code needs dark-on-light to scan, whatever the app theme. */
export const APPLY_QR_BACKGROUND = "#ffffff";
export const APPLY_QR_FOREGROUND = "#000000";

export function applyQrLabel(title: string): string {
  return `QR code for the apply link to ${title}`;
}
