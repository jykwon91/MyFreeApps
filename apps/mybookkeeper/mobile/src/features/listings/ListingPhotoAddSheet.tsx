import { OptionSheet } from "@platform/mobile";
import { LISTING_PHOTO_ADD_OPTIONS, LISTING_PHOTO_MESSAGES as MESSAGES } from "../../constants/listingPhotos";
import type { ListingPhotoAddSource } from "../../types/ListingPhotoAddSource";

interface ListingPhotoAddSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (source: ListingPhotoAddSource) => void;
}

/** Where the photos come from: the camera or the library. */
export default function ListingPhotoAddSheet({ isOpen, onClose, onSelect }: ListingPhotoAddSheetProps) {
  return <OptionSheet<ListingPhotoAddSource> isOpen={isOpen} onClose={onClose} onSelect={onSelect} options={LISTING_PHOTO_ADD_OPTIONS} title={MESSAGES.addTitle} value="library" />;
}
