import { httpStatus } from "@mybookkeeper/api-client/utils/httpStatus";
import { writeOutcome } from "@platform/core/utils/writeOutcome";
import { LISTING_PHOTO_MESSAGES as MESSAGES } from "../../constants/listingPhotos";

/** Why a photo didn't upload, in fixed words. The upload's failure refreshes the listing, so "check the photos" has a fresh list to check. */
export function listingPhotoUploadFailure(error: unknown, maxMegabytes: number): string {
  if (writeOutcome(error) === "unknown") return MESSAGES.unsureUploaded;
  switch (httpStatus(error)) {
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
