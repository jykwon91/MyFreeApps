import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { DOCUMENT_PICKER_TYPES, MAX_FILES_AT_ONCE } from "../../constants/capture";
import type { PickedDocument } from "../../types/PickedDocument";
import type { PickedPhoto } from "../../types/PickedPhoto";

export async function pickPhotos(): Promise<PickedPhoto[]> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsMultipleSelection: true,
    selectionLimit: MAX_FILES_AT_ONCE,
    exif: false,
  });
  return result.canceled ? [] : result.assets;
}

export async function pickDocuments(): Promise<PickedDocument[]> {
  const result = await DocumentPicker.getDocumentAsync({
    type: [...DOCUMENT_PICKER_TYPES],
    multiple: true,
    copyToCacheDirectory: true,
  });
  if (result.canceled) return [];
  return result.assets
    .slice(0, MAX_FILES_AT_ONCE)
    .map(({ uri, name, mimeType, size }) => ({ uri, name, mimeType, size }));
}
