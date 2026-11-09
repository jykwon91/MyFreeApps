import { useEffect, useRef, useState } from "react";
import { LISTING_PHOTO_FILE_NAME, LISTING_PHOTO_MESSAGES as MESSAGES } from "../../constants/listingPhotos";
import type { FileForUpload } from "../../types/FileForUpload";
import type { ListingPhotoAddSource } from "../../types/ListingPhotoAddSource";
import type { ListingPhotoPreparing } from "../../types/ListingPhotoPreparing";
import { discardFile } from "../capture/uploadQueueFiles";
import { releaseHeldFile } from "../uploads/heldFile";
import { holdPhoto } from "../uploads/pickHeldFile";
import { chooseLibraryAssets, takeListingPhoto } from "./pickListingPhotos";

/**
 * Gets photos from the camera or library and hands each to `onReady` the moment it is ready, rather
 * than after the last one. If the screen goes meanwhile it stops, and lets go of what it had made.
 */
export function useListingPhotoPicker(onReady: (file: FileForUpload) => void) {
  const [isBusy, setIsBusy] = useState(false);
  const [preparing, setPreparing] = useState<ListingPhotoPreparing | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const isWorking = useRef(false);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  /** Returns how many couldn't be read. */
  async function prepareAll(assets: Parameters<typeof holdPhoto>[0][]): Promise<number> {
    let unreadable = 0;
    for (const [index, asset] of assets.entries()) {
      if (!isMounted.current) {
        // The picker's own copy of each photo that was never prepared.
        for (const rest of assets.slice(index)) discardFile(rest.uri);
        return unreadable;
      }
      setPreparing({ done: index, total: assets.length });
      try {
        const file = await holdPhoto(asset, LISTING_PHOTO_FILE_NAME);
        if (isMounted.current) onReady(file);
        else releaseHeldFile(file.uri);
      } catch {
        unreadable += 1;
      }
    }
    return unreadable;
  }

  async function add(source: ListingPhotoAddSource): Promise<void> {
    if (isWorking.current) return;
    isWorking.current = true;
    setIsBusy(true);
    setProblem(null);
    try {
      let unreadable = 0;
      if (source === "camera") {
        const photo = await takeListingPhoto();
        if (photo === "denied") setProblem(MESSAGES.cameraDenied);
        else if (photo && isMounted.current) onReady(photo);
        else if (photo) releaseHeldFile(photo.uri);
      } else {
        unreadable = await prepareAll(await chooseLibraryAssets());
      }
      if (unreadable > 0 && isMounted.current) setProblem(MESSAGES.pickFailed);
    } catch {
      if (isMounted.current) setProblem(MESSAGES.pickFailed);
    } finally {
      isWorking.current = false;
      if (isMounted.current) {
        setIsBusy(false);
        setPreparing(null);
      }
    }
  }

  return { add, isBusy, preparing, problem };
}
