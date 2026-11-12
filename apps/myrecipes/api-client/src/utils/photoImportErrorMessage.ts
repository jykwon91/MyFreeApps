import { PHOTO_IMPORT_MAX_MEGABYTES } from "../constants/photoImport";
import { requestErrorStatus } from "./requestErrorStatus";

/** What to tell the user when reading a recipe from a photo fails. */
export function photoImportErrorMessage(error: unknown): string {
  switch (requestErrorStatus(error)) {
    case 413:
      return `That photo is too large (max ${PHOTO_IMPORT_MAX_MEGABYTES} MB). Try a smaller or compressed version.`;
    case 415:
      return "That file isn't a photo we can read. Use a JPG, PNG or WebP.";
    case 422:
      return "We couldn't read a recipe from that photo. Try a clearer or better-lit photo.";
    case 429:
      return "You've imported a lot of photos recently. Give it a few minutes and try again.";
    case 503:
      return "Photo import isn't available right now.";
    default:
      return "Something went wrong — please try again.";
  }
}
