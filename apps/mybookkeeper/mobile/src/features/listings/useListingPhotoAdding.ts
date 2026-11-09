import { useToast } from "@platform/mobile";
import { useEffect, useRef } from "react";
import { LISTING_PHOTO_MESSAGES as MESSAGES } from "../../constants/listingPhotos";
import { useListingPhotoPicker } from "./useListingPhotoPicker";
import { useListingPhotoUploads } from "./useListingPhotoUploads";

/** Picking photos and sending them, with one "added" note once everything picked has gone. */
export function useListingPhotoAdding(listingId: string) {
  const { showToast } = useToast();
  const uploaded = useRef(0);
  const isPicking = useRef(false);

  function announce(): void {
    if (uploaded.current === 0) return;
    showToast(uploaded.current === 1 ? MESSAGES.uploadedOne : MESSAGES.uploadedMany);
    uploaded.current = 0;
  }

  const uploads = useListingPhotoUploads(listingId, (count) => {
    uploaded.current += count;
    if (!isPicking.current) announce();
  });
  const picker = useListingPhotoPicker((file) => uploads.add([file]));

  useEffect(() => {
    isPicking.current = picker.isBusy;
    if (!picker.isBusy) announce();
    // announce only reads refs and the toast function
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picker.isBusy]);

  return { uploads, picker, isAdding: picker.isBusy || uploads.items.length > 0 };
}
