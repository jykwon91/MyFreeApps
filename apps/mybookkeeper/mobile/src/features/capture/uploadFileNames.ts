import { DOCUMENT_UPLOAD_EXTENSIONS } from "@mybookkeeper/api-client/constants/documentUpload";
import { fileExtension, isSupportedDocumentUpload } from "@mybookkeeper/api-client/utils/documentUploadFile";
import { mimeTypeFor } from "@platform/core/utils/mimeTypeFor";
import { DOCUMENT_MIME_TYPE_ALIASES } from "../../constants/capture";
import type { PickedDocument } from "../../types/PickedDocument";

export function photoName(now: Date = new Date()): string {
  return `receipt-${now.toISOString().slice(0, 19).replace(/[:T]/g, "-")}.jpg`;
}

/** The type the picker reported (or another name for it), or failing that the extension on its own copy of the file. */
function extensionFor({ mimeType, uri }: PickedDocument): string | undefined {
  const byType = DOCUMENT_UPLOAD_EXTENSIONS.find((extension) => mimeTypeFor(extension) === mimeType);
  if (byType) return byType;
  const byAlias = mimeType === undefined ? undefined : DOCUMENT_MIME_TYPE_ALIASES[mimeType];
  if (byAlias) return byAlias;
  const fromCopy = fileExtension(uri);
  return isSupportedDocumentUpload(fromCopy) ? fromCopy : undefined;
}

/**
 * The queue and the server read a file's type from its name, and a picked file's name can lack the extension.
 * A name that already has one keeps it, so an unsupported file (``IMG_1.HEIC``) is refused rather than renamed.
 */
export function documentFileName(picked: PickedDocument): string {
  if (fileExtension(picked.name) !== "") return picked.name;
  const extension = extensionFor(picked);
  return extension ? `${picked.name}${extension}` : picked.name;
}
