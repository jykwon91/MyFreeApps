import { LISTING_PHOTO_FILE_NAME, LISTING_PHOTO_MESSAGES, LISTING_PHOTO_NO_SELECTION_LIMIT } from "../../constants/listingPhotos";
import type { FileForUpload } from "../../types/FileForUpload";
import { useHeldPhotoPicker } from "../uploads/useHeldPhotoPicker";

/** A listing holds as many photos as the host likes, so the library sets no limit. */
export function useListingPhotoPicker(onReady: (file: FileForUpload) => void) {
  return useHeldPhotoPicker({
    onReady,
    nextName: () => LISTING_PHOTO_FILE_NAME,
    selectionLimit: LISTING_PHOTO_NO_SELECTION_LIMIT,
    messages: LISTING_PHOTO_MESSAGES,
  });
}
