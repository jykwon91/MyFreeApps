import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { SCREENING_REPORT_FILE_TYPES } from "../../constants/applicantScreening";
import type { FileForUpload } from "../../types/FileForUpload";
import { preparePhoto } from "../capture/preparePhoto";
import { discardFile } from "../capture/uploadQueueFiles";
import { holdReport } from "./screeningReportFile";

const PHOTO_NAME = "screening-report.jpg";

async function holdPhoto(asset: ImagePicker.ImagePickerAsset): Promise<FileForUpload> {
  try {
    const prepared = await preparePhoto(asset.uri, asset.width, asset.height);
    return { uri: holdReport(prepared, PHOTO_NAME), name: PHOTO_NAME, mimeType: "image/jpeg" };
  } finally {
    // The picker's own copy can still hold where the photo was taken.
    discardFile(asset.uri);
  }
}

export async function chooseReportFile(): Promise<FileForUpload | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: SCREENING_REPORT_FILE_TYPES, copyToCacheDirectory: true });
  if (result.canceled) return null;
  const [asset] = result.assets;
  return { uri: holdReport(asset.uri, asset.name), name: asset.name, mimeType: asset.mimeType ?? "application/pdf" };
}

export async function chooseReportPhoto(): Promise<FileForUpload | null> {
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], exif: false });
  return result.canceled ? null : holdPhoto(result.assets[0]);
}

/** Doesn't save to the photo library: it's someone else's report, not the host's picture. */
export async function takeReportPhoto(): Promise<FileForUpload | "denied" | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) return "denied";
  const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], exif: false });
  return result.canceled ? null : holdPhoto(result.assets[0]);
}
