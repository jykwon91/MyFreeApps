import type { ListingPhotoAddSource } from "../types/ListingPhotoAddSource";

export const LISTING_PHOTO_MESSAGES = {
  heading: "Photos",
  noneHeading: "No photos yet.",
  noneBody: "Add photos so people can see the room. The first one is the cover.",
  noneViewOnlyBody: "Someone with edit access can add photos.",
  add: "Add photos",
  addTitle: "Add photos from where?",
  takePhoto: "Take a photo",
  fromLibrary: "Photo library",
  cover: "Cover",
  unavailable: "Photo unavailable",
  unavailableDetail: "I can't show this photo right now.",
  select: "Select",
  cancelSelect: "Done",
  removeSelected: "Remove selected",
  removing: "Removing…",
  noneSelected: "Tap photos to select them.",
  shareOne: "Share or save",
  shareFailed: "I couldn't share that photo.",
  makeCover: "Make cover",
  earlier: "Move earlier",
  later: "Move later",
  remove: "Remove",
  close: "Close",
  previous: "Previous photo",
  next: "Next photo",
  removeOneTitle: "Remove this photo?",
  removeOneBody: "This takes it off the listing and deletes it. You can't undo it in the app.",
  removed: "Photo removed.",
  removedMany: "Photos removed.",
  alreadyRemoved: "That photo was already removed.",
  moved: "Order changed.",
  orderStale: "The photos changed on another device. I've refreshed them, so try the move again.",
  retry: "Try again",
  discardUpload: "Remove",
  waiting: "Waiting",
  sending: "Sending",
  failed: "didn't upload",
  uploadsTitle: "Photos that didn't upload",
  discardTitle: "Leave without uploading?",
  discardBody: "Photos that haven't uploaded yet will be lost.",
  leave: "Leave",
  stay: "Stay",
  pickFailed: "I couldn't get some of those photos. Want to try again?",
  cameraDenied: "I need camera access for that. You can turn it on in Settings.",
  caption: "Caption",
  uploadedOne: "Photo added.",
  uploadedMany: "Photos added.",
} as const;

export function removeManyTitle(count: number): string {
  return count === 1 ? "Remove 1 photo?" : `Remove ${count} photos?`;
}

export function removeManyBody(count: number): string {
  return `This takes ${count === 1 ? "it" : "them"} off the listing and deletes ${count === 1 ? "it" : "them"}. You can't undo it in the app.`;
}

export function partialRemoveNote(removed: number, total: number): string {
  return `Removed ${removed} of ${total}. I couldn't remove the rest. Want to try again?`;
}

export function uploadProgress(done: number, total: number): string {
  return `Uploading ${Math.min(done + 1, total)} of ${total}`;
}

export function selectedCount(count: number): string {
  return `${count} selected`;
}

export function photoPosition(index: number, total: number): string {
  return `Photo ${index + 1} of ${total}`;
}

export function uploadFailureCopy(status: number | undefined, maxMegabytes: number): string {
  switch (status) {
    case undefined:
      return "I couldn't reach the server. Want to try again?";
    case 413:
      return `That photo is over ${maxMegabytes} MB, which is more than a listing can hold.`;
    case 415:
      return "That kind of file isn't a photo I can use.";
    case 403:
      return "You have view-only access, so I can't add photos.";
    case 404:
      return "I can't find that listing anymore. It may have been deleted.";
    case 503:
      return "Photo storage isn't available right now. Try again in a bit.";
    default:
      return "I couldn't upload that photo. Want to try again?";
  }
}

/** 0 means no limit: the server has none on how many photos a listing holds. */
export const LISTING_PHOTO_NO_SELECTION_LIMIT = 0;
export const LISTING_PHOTO_FILE_NAME = "listing-photo.jpg";
export const LISTING_PHOTO_GRID_COLUMNS = 3;
export const LISTING_PHOTO_CAPTION_LINES = 1;

export const LISTING_PHOTO_ADD_OPTIONS: { value: ListingPhotoAddSource; label: string }[] = [
  { value: "camera", label: LISTING_PHOTO_MESSAGES.takePhoto },
  { value: "library", label: LISTING_PHOTO_MESSAGES.fromLibrary },
];

export function preparingProgress(done: number, total: number): string {
  return `Preparing ${Math.min(done + 1, total)} of ${total}`;
}

/** "Photo 2" for the upload list: where the photo is among those still to go. */
export function uploadName(position: number): string {
  return `photo ${position}`;
}

export function retryUploadLabel(position: number): string {
  return `Retry ${uploadName(position)}`;
}

export function removeUploadLabel(position: number): string {
  return `Remove ${uploadName(position)}`;
}

export function uploadStateLabel(position: number, state: string): string {
  return `Photo ${position}, ${state}`;
}

export function photoLabel(index: number, total: number, caption: string | null, extras: (string | null)[]): string {
  return [photoPosition(index, total), caption, ...extras].filter(Boolean).join(", ");
}
