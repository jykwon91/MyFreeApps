import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { mimeTypeFor } from "../../lib/mimeTypeFor";
import type { FileForUpload } from "../../types/FileForUpload";
import { preparePhoto } from "../capture/preparePhoto";
import { discardFile } from "../capture/uploadQueueFiles";
import { holdFile } from "./heldFile";

export async function holdPhoto(asset: ImagePicker.ImagePickerAsset, name: string): Promise<FileForUpload> {
  try {
    const prepared = await preparePhoto(asset.uri, asset.width, asset.height);
    return { uri: holdFile(prepared, name), name, mimeType: "image/jpeg" };
  } finally {
    // The picker's own copy can still hold where the photo was taken.
    discardFile(asset.uri);
  }
}

export async function chooseHeldFile(types: readonly string[]): Promise<FileForUpload | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: [...types], copyToCacheDirectory: true });
  if (result.canceled) return null;
  const [asset] = result.assets;
  // Some Android pickers report a file they can't name as octet-stream; the extension says more.
  const declared = asset.mimeType && asset.mimeType !== "application/octet-stream" ? asset.mimeType : mimeTypeFor(asset.name);
  return { uri: holdFile(asset.uri, asset.name), name: asset.name, mimeType: declared, size: asset.size };
}

export async function chooseHeldPhoto(name: string): Promise<FileForUpload | null> {
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], exif: false });
  return result.canceled ? null : holdPhoto(result.assets[0], name);
}

/** Doesn't save to the photo library: it's someone else's paperwork, not the host's picture. */
export async function takeHeldPhoto(name: string): Promise<FileForUpload | "denied" | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) return "denied";
  const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], exif: false });
  return result.canceled ? null : holdPhoto(result.assets[0], name);
}
