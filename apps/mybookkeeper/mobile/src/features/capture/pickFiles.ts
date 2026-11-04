import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { MAX_FILES_AT_ONCE } from "../../constants/capture";
import type { PickedPdf } from "../../types/PickedPdf";
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

export async function pickPdfs(): Promise<PickedPdf[]> {
  const result = await DocumentPicker.getDocumentAsync({
    type: "application/pdf",
    multiple: true,
    copyToCacheDirectory: true,
  });
  return result.canceled ? [] : result.assets.slice(0, MAX_FILES_AT_ONCE);
}
