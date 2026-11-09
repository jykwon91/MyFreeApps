import * as ImagePicker from "expo-image-picker";
import { LISTING_PHOTO_FILE_NAME, LISTING_PHOTO_NO_SELECTION_LIMIT } from "../../constants/listingPhotos";
import type { FileForUpload } from "../../types/FileForUpload";
import { takeHeldPhoto } from "../uploads/pickHeldFile";

/** The photos the person chose, not yet re-encoded. */
export async function chooseLibraryAssets(): Promise<ImagePicker.ImagePickerAsset[]> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsMultipleSelection: true,
    selectionLimit: LISTING_PHOTO_NO_SELECTION_LIMIT,
    exif: false,
  });
  return result.canceled ? [] : result.assets;
}

export async function takeListingPhoto(): Promise<FileForUpload | "denied" | null> {
  return takeHeldPhoto(LISTING_PHOTO_FILE_NAME);
}
