import type { ListingPhoto } from "@mybookkeeper/api-client/types/listing/listing-photo";
import { downloadFailureMessage, useToast } from "@platform/mobile";
import { mimeTypeFor } from "@platform/core/utils/mimeTypeFor";
import { useState } from "react";
import { LISTING_PHOTO_MESSAGES as MESSAGES } from "../../constants/listingPhotos";
import { openAttachmentFile } from "../documents/openDocumentFile";
import { photoUrl } from "./listingPhotoDisplay";

interface SharePhotos {
  isSharing: boolean;
  /** Downloads each photo and opens the share sheet on it, one after another; a toast says if that failed. */
  share: (photos: readonly ListingPhoto[]) => Promise<void>;
}

/**
 * The phone's share sheet takes one file at a time (expo-sharing has no multi-file call on
 * either platform), so several photos open it once each, in order, as each sheet is dismissed.
 */
export function useSharePhotos(): SharePhotos {
  const { showToast } = useToast();
  const [isSharing, setIsSharing] = useState(false);

  async function share(photos: readonly ListingPhoto[]): Promise<void> {
    const failure = photos.length === 1 ? MESSAGES.shareFailed : MESSAGES.shareManyFailed;
    setIsSharing(true);
    try {
      for (const photo of photos) {
        const url = photoUrl(photo);
        if (url === null) throw new Error("Photo has no link");
        await openAttachmentFile(url, { id: photo.id, filename: photo.storage_key, content_type: mimeTypeFor(photo.storage_key) });
      }
    } catch (error) {
      showToast(downloadFailureMessage(error, failure), "error");
    } finally {
      setIsSharing(false);
    }
  }

  return { isSharing, share };
}
