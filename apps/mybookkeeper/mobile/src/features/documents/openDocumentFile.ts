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
  const directory = documentFiles();
  directory.create({ idempotent: true, intermediates: true });
  const destination = new File(directory, `${documentId}.pdf`);
  try {
    await File.downloadFileAsync(url, destination, { headers, idempotent: true });
    await Sharing.shareAsync(destination.uri, { mimeType: PDF_MIME_TYPE, UTI: PDF_UTI });
  } finally {
    if (destination.exists) destination.delete();
  }
}

/** For a copy left behind when the app was killed while one was open. */
export function clearDocumentFiles(): void {
  const directory = documentFiles();
  if (directory.exists) directory.delete();
}
