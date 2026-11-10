import { DOCUMENT_UPLOAD_MIME_TYPES } from "@myjobhunter/api-client/constants/documentUploadLimits";
import { mimeTypeFor } from "@platform/core/utils/mimeTypeFor";
import type { FileForUpload } from "@platform/mobile";
import * as DocumentPicker from "expo-document-picker";

/** Asks for one file of a type the upload accepts. Null when the person backs out. */
export async function pickDocumentFile(): Promise<FileForUpload | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: [...DOCUMENT_UPLOAD_MIME_TYPES], copyToCacheDirectory: true });
  if (result.canceled) return null;
  const [asset] = result.assets;
  // Some Android pickers report a file they can't name as octet-stream; the extension says more.
  const mimeType = asset.mimeType && asset.mimeType !== "application/octet-stream" ? asset.mimeType : mimeTypeFor(asset.name);
  return { uri: asset.uri, name: asset.name, mimeType, size: asset.size };
}
