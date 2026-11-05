import { Directory, File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";

const PDF_MIME_TYPE = "application/pdf";
const PDF_UTI = "com.adobe.pdf";

function documentFiles(): Directory {
  return new Directory(Paths.cache, "documents");
}

/**
 * Downloads a PDF to a file named by id, never by the document's own name, opens the
 * system's viewer, and removes the copy afterwards: it's someone's financial record.
 */
export async function openDocumentFile(
  url: string,
  documentId: string,
  headers: Record<string, string>,
): Promise<void> {
  await openCopy(url, `${documentId}.pdf`, { headers, idempotent: true }, { mimeType: PDF_MIME_TYPE, UTI: PDF_UTI });
}

/** The same for a file on a signed link, which needs no sign-in. The extension tells the viewer what it is. */
export async function openAttachmentFile(url: string, file: { id: string; filename: string; content_type: string }): Promise<void> {
  const extension = /\.[a-z0-9]{1,8}$/i.exec(file.filename)?.[0] ?? "";
  await openCopy(url, `${file.id}${extension}`, { idempotent: true }, { mimeType: file.content_type });
}

/** A report the server builds on request. Its name is the year and form, so it says nothing private. */
export async function shareExportFile(url: string, fileName: string, headers: Record<string, string>): Promise<void> {
  await openCopy(url, fileName, { headers, idempotent: true }, { mimeType: PDF_MIME_TYPE, UTI: PDF_UTI });
}

async function openCopy(
  url: string,
  fileName: string,
  download: { headers?: Record<string, string>; idempotent: boolean },
  share: Sharing.SharingOptions,
): Promise<void> {
  const directory = documentFiles();
  directory.create({ idempotent: true, intermediates: true });
  const destination = new File(directory, fileName);
  try {
    await File.downloadFileAsync(url, destination, download);
    await Sharing.shareAsync(destination.uri, share);
  } finally {
    if (destination.exists) destination.delete();
  }
}

/** For a copy left behind when the app was killed while one was open. */
export function clearDocumentFiles(): void {
  try {
    const directory = documentFiles();
    if (directory.exists) directory.delete();
  } catch (error) {
    console.warn("Couldn't clear document copies", error);
  }
}
