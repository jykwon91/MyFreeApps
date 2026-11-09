import type { FileForUpload } from "../../types/FileForUpload";
import * as ImagePicker from "expo-image-picker";
import { holdPhoto, takeHeldPhoto } from "../uploads/pickHeldFile";

/** 0 means no limit: the server has none on how many photos a listing holds. */
const NO_SELECTION_LIMIT = 0;
const PHOTO_NAME = "listing-photo.jpg";

export interface PickedListingPhotos {
  files: FileForUpload[];
  /** Photos that were picked but couldn't be read. */
  unreadable: number;
}

/** Re-encodes and holds each photo: a JPEG under the server's limit, without where it was taken. */
export async function pickLibraryPhotos(): Promise<PickedListingPhotos> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsMultipleSelection: true,
    selectionLimit: NO_SELECTION_LIMIT,
    exif: false,
  });
  const assets = result.canceled ? [] : result.assets;
  const files: FileForUpload[] = [];
  let unreadable = 0;
  for (const asset of assets) {
    try {
      files.push(await holdPhoto(asset, PHOTO_NAME));
    } catch {
      unreadable += 1;
    }
  }
  return { files, unreadable };
}

export async function takeListingPhoto(): Promise<FileForUpload | "denied" | null> {
  return takeHeldPhoto(PHOTO_NAME);
}
