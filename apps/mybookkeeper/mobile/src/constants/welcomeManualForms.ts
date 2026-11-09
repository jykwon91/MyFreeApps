import { WELCOME_MANUAL_STALE_ORDER_MESSAGE } from "@mybookkeeper/api-client/constants/welcomeManualLimits";
import type { WelcomeManualEmailFormValues } from "@mybookkeeper/api-client/types/welcome-manual/welcome-manual-email-form-values";
import type { WelcomeManualSendResponse } from "@mybookkeeper/api-client/types/welcome-manual/welcome-manual-send-response";

export const WELCOME_MANUAL_FORM_MESSAGES = {
  titleLabel: "Title",
  introLabel: "Introduction",
  introPlaceholder: "A short welcome for your guests",
  propertyLabel: "Property",
  noProperty: "No property",
  chooseProperty: "Choose a property",
  seedLabel: "Start with the usual sections",
  seedNote: "Wi-Fi, parking, trash and recycling, laundry and check-out.",
  create: "Create manual",
  creating: "Creating…",
  save: "Save changes",
  saving: "Saving…",
  created: "Manual created.",
  saved: "Manual saved.",
  nothingToSave: "Nothing changed.",
} as const;

export const WELCOME_MANUAL_SECTION_MESSAGES = {
  heading: "Sections",
  loadingList: "Loading sections",
  none: "No sections yet.",
  noneBody: "Sections hold the Wi-Fi, parking and house rules guests look up.",
  add: "Add a section",
  adding: "Adding…",
  added: "Section added.",
  edit: "Edit section",
  save: "Save changes",
  saving: "Saving…",
  saved: "Section saved.",
  delete: "Delete section",
  deleting: "Deleting…",
  deleted: "Section deleted.",
  alreadyDeleted: "That section was already deleted.",
  titleLabel: "Title",
  bodyLabel: "Text",
  bodyPlaceholder: "What guests need to know",
  scopeLabel: "Shown to",
  everyone: "Every room",
  chooseScope: "Who sees this section",
  fieldsRow: "Label and value pairs",
  photosRow: "Photos",
  reorder: "Reorder sections",
  reorderTitle: "Reorder sections",
  newDefaultTitle: "New section",
  cantFind: "I can't find that section.",
  noText: "No text yet",
  atLimit: "You've reached the section limit for this manual.",
} as const;

export function deleteSectionTitle(title: string): string {
  return `Delete "${title}"?`;
}

export const DELETE_SECTION_BODY = "Its fields and photos go with it, for good.";

export const WELCOME_MANUAL_FIELD_MESSAGES = {
  addConfirm: "Add",
  heading: "Label and value pairs",
  hint: "Like Wi-Fi network and its password.",
  none: "No fields yet.",
  add: "Add a field",
  edit: "Edit field",
  labelLabel: "Label",
  valueLabel: "Value",
  save: "Save",
  saving: "Saving…",
  adding: "Adding…",
  added: "Field added.",
  saved: "Field saved.",
  delete: "Delete field",
  deleting: "Deleting…",
  deleted: "Field deleted.",
  alreadyDeleted: "That field was already deleted.",
  cancel: "Cancel",
  reorder: "Reorder fields",
  reorderTitle: "Reorder fields",
  atLimit: "You've reached the field limit for this section.",
  deleteTitle: "Delete this field?",
  deleteBody: "It is removed from the guide for good.",
  loading: "Loading fields",
} as const;

export const WELCOME_MANUAL_PHOTO_MESSAGES = {
  heading: "Photos",
  none: "No photos yet.",
  add: "Add photos",
  uploadTitle: "Add photos",
  upload: "Upload",
  uploading: "Uploading…",
  cancel: "Cancel",
  choosePhotos: "Add one or more photos. They go up together.",
  noneChosen: "No photos chosen yet.",
  takePhoto: "Take a photo",
  atLimit: "This section has all the photos it can hold.",
  uploadedOne: "Photo added.",
  uploadedMany: "Photos added.",
  view: "Photo",
  captionLabel: "Caption",
  captionPlaceholder: "What guests are looking at",
  save: "Save caption",
  saving: "Saving…",
  saved: "Caption saved.",
  delete: "Delete photo",
  deleting: "Deleting…",
  deleted: "Photo deleted.",
  alreadyDeleted: "That photo was already deleted.",
  reorder: "Reorder photos",
  reorderTitle: "Reorder photos",
  unavailable: "This photo is missing from storage.",
  noCaption: "No caption",
  loading: "Loading photos",
  close: "Close",
} as const;

export const DELETE_PHOTO_TITLE = "Delete this photo?";
export const DELETE_PHOTO_BODY = "It is removed from the guide for good.";

export function photoCountLabel(count: number): string {
  return `${count} ${count === 1 ? "photo" : "photos"}`;
}

/** A photo with no caption, named by its place in the list. */
export function unnamedPhotoLabel(position: number): string {
  return `Photo ${position}, no caption`;
}

export function photosLeftLabel(count: number): string {
  return count === 1 ? "You can add 1 more photo." : `You can add ${count} more photos.`;
}

/** Each photo held gets its own name, so two from the camera don't both read "section-photo.jpg". */
export function sectionPhotoName(position: number, extension = "jpg"): string {
  return `photo-${position}.${extension}`;
}

export function rejectedPhotosMessage(rejected: readonly string[]): string {
  return rejected.join("; ");
}

export const WELCOME_MANUAL_ROOM_MESSAGES = {
  addConfirm: "Add",
  heading: "Rooms",
  hint: "Let by the room? Add rooms, then give each room its own sections.",
  none: "No rooms. The guide covers the whole place.",
  add: "Add a room",
  edit: "Rename room",
  nameLabel: "Room name",
  save: "Save",
  saving: "Saving…",
  adding: "Adding…",
  added: "Room added.",
  saved: "Room saved.",
  delete: "Delete room",
  deleting: "Deleting…",
  deleted: "Room deleted.",
  alreadyDeleted: "That room was already deleted.",
  cancel: "Cancel",
  loading: "Loading rooms",
  sectionsGoToo: "Its own sections are deleted with it.",
  sectionCount: (count: number) => (count === 1 ? "1 section of its own" : `${count} sections of its own`),
  atLimit: "You've reached the room limit for this manual.",
} as const;

export function deleteRoomTitle(name: string): string {
  return `Delete "${name}"?`;
}

export const WELCOME_MANUAL_PLACE_MESSAGES = {
  addConfirm: "Add",
  heading: "Where to eat",
  none: "No places yet.",
  noneBody: "Add the restaurants you send guests to.",
  add: "Add a place",
  edit: "Edit place",
  nameLabel: "Name",
  cuisineLabel: "Cuisine",
  priceLabel: "Price",
  noPrice: "None",
  choosePrice: "Choose a price",
  noteLabel: "Note",
  mapLabel: "Map link",
  mapPlaceholder: "https://maps.google.com/…",
  save: "Save",
  saving: "Saving…",
  adding: "Adding…",
  added: "Place added.",
  saved: "Place saved.",
  delete: "Delete place",
  deleting: "Deleting…",
  deleted: "Place deleted.",
  alreadyDeleted: "That place was already deleted.",
  cancel: "Cancel",
  loading: "Loading places",
  atLimit: "You've reached the place limit for this manual.",
} as const;

export function cuisineSuggestionLabel(cuisine: string): string {
  return `Use ${cuisine}`;
}

export const DELETE_PLACE_BODY = "It is removed from the guide for good.";

export function deletePlaceTitle(name: string): string {
  return `Delete "${name}"?`;
}

export const WELCOME_MANUAL_SHARE_MESSAGES = {
  heading: "Share with guests",
  off: "This manual isn't shared yet.",
  offBody: "Sharing makes a link and a 4-digit code guests need to open it.",
  enable: "Create share link",
  enabling: "Creating…",
  enabled: "Share link created.",
  link: "Link",
  code: "Access code",
  copyLink: "Copy link",
  copyCode: "Copy code",
  copiedLink: "Link copied.",
  copiedCode: "Code copied.",
  copyFailed: "I couldn't copy that. Want to try again?",
  send: "Send the link",
  newCode: "Make a new code",
  newCodeTitle: "Make a new code?",
  newCodeBody: "The old code stops working. Guests will need the new one.",
  newCodeConfirm: "Make new code",
  newCodeMade: "New code made.",
  revoke: "Stop sharing",
  revokeTitle: "Stop sharing this manual?",
  revokeBody: "The link and code stop working for everyone who has them.",
  revokeConfirm: "Stop sharing",
  revoked: "Sharing stopped.",
  working: "Working…",
  shareFailed: "I couldn't open sharing. Want to try again?",
} as const;

export const WELCOME_MANUAL_PREVIEW_MESSAGES = {
  heading: "What guests see",
  scopeLabel: "Preview of",
  sharedLink: "The shared link",
  roomGuide: "Emailed guide for",
  chooseScope: "Choose what to preview",
  noSections: "Nothing to show yet. Add a section first.",
  placesHeading: "Where to eat",
  searchLabel: "Search restaurants",
  searchPlaceholder: "Search restaurants, cuisine, or notes",
  filters: "Filters",
  filterTitle: "Filter places",
  cuisineLabel: "Cuisine",
  allCuisines: "All cuisines",
  priceLabel: "Price",
  anyPrice: "Any",
  clearFilters: "Clear filters",
  done: "Done",
  noMatches: "No places match your filters.",
} as const;

export function filtersLabel(activeCount: number): string {
  return activeCount === 0 ? WELCOME_MANUAL_PREVIEW_MESSAGES.filters : `${WELCOME_MANUAL_PREVIEW_MESSAGES.filters} (${activeCount})`;
}

export function roomScopeLabel(roomName: string): string {
  return `${roomName}'s emailed guide`;
}

export const WELCOME_MANUAL_EMAIL_MESSAGES = {
  heading: "Email the guide",
  emailLabel: "Guest's email",
  nameLabel: "Guest's name (optional)",
  roomLabel: "Which room's guide",
  chooseRoom: "Choose a room",
  noRoomChosen: "Choose a room",
  sharedOnly: "No room — shared sections only",
  send: "Send guide",
  sending: "Sending…",
  sentHeading: "Guide sent.",
  failedHeading: "The email didn't go through.",
  skippedHeading: "Email isn't set up here.",
  skippedBody: "This workspace can't send email yet, so nothing was sent.",
  failedBody: "Nothing reached the guest. You can try again.",
  tryAgain: "Try again",
  sendAnother: "Send to someone else",
  done: "Done",
  noSections: "Add a section before emailing the guide.",
  demo: "Demo accounts can't send email.",
} as const;

export function emailSentBody(email: string): string {
  return `I sent the guide to ${email}. It should arrive shortly.`;
}

export const WELCOME_MANUAL_EMAIL_EMPTY_VALUES: WelcomeManualEmailFormValues = { recipient_email: "", recipient_name: "", room_id: "" };

/** What the email's outcome says, by what happened to it. */
export function emailOutcomeCopy(outcome: WelcomeManualSendResponse): { heading: string; body: string } {
  const messages = WELCOME_MANUAL_EMAIL_MESSAGES;
  switch (outcome.status) {
    case "sent":
      return { heading: messages.sentHeading, body: emailSentBody(outcome.recipient_email) };
    case "failed":
      return { heading: messages.failedHeading, body: messages.failedBody };
    case "skipped":
      return { heading: messages.skippedHeading, body: messages.skippedBody };
  }
}

export const WELCOME_MANUAL_REORDER_MESSAGES = {
  save: "Save order",
  saving: "Saving…",
  cancel: "Cancel",
  saved: "Order saved.",
  stale: WELCOME_MANUAL_STALE_ORDER_MESSAGE,
  hint: "Use the arrows to move items. Nothing changes until you save.",
  nothingToSave: "Move something first.",
} as const;

export function moveUpLabel(name: string): string {
  return `Move ${name} up`;
}

export function moveDownLabel(name: string): string {
  return `Move ${name} down`;
}

export const WELCOME_MANUAL_PHOTO_THUMBNAIL = 56;
export const WELCOME_MANUAL_PHOTO_FULL_HEIGHT = 260;
export const WELCOME_MANUAL_INTRO_MIN_HEIGHT = 120;
export const WELCOME_MANUAL_SECTION_BODY_MIN_HEIGHT = 144;
