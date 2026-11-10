import { OptionSheet } from "@platform/mobile";
import { LISTING_PHOTO_ADD_OPTIONS, LISTING_PHOTO_MESSAGES as MESSAGES } from "../../constants/listingPhotos";
import type { HeldPhotoSource } from "../../types/HeldPhotoSource";

interface ListingPhotoAddSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (source: HeldPhotoSource) => void;
}

/** Where the photos come from: the camera or the library. */
export default function ListingPhotoAddSheet({ isOpen, onClose, onSelect }: ListingPhotoAddSheetProps) {
  return <OptionSheet<HeldPhotoSource> isOpen={isOpen} onClose={onClose} onSelect={onSelect} options={LISTING_PHOTO_ADD_OPTIONS} title={MESSAGES.addTitle} value="library" />;
}
