import { clearDownloadCopies, shareDownloadedFile, type ShareDownloadOptions } from "@platform/mobile";
import { Directory, File, Paths } from "expo-file-system";
import { DOCUMENT_FILES_DIRECTORY } from "../../constants/documentFiles";
import { DOCUMENT_FILE_TYPES } from "../../constants/documentFileTypes";

const PDF_MIME_TYPE = "application/pdf";
const PDF_UTI = "com.adobe.pdf";
const CSV_MIME_TYPE = "text/csv";
const CSV_UTI = "public.comma-separated-values-text";

function documentFiles(): Directory {
  return new Directory(Paths.cache, DOCUMENT_FILES_DIRECTORY);
}

/**
 * Downloads a document to a file named by id, never by the document's own name, with an
 * extension from its content type so Files, Word or Excel know what it is. Opens the share
 * sheet, then removes the copy: it's someone's financial record.
 */
export async function openDocumentFile(
  url: string,
  documentId: string,
  mimeType: string,
  headers: Record<string, string>,
): Promise<void> {
  const type = DOCUMENT_FILE_TYPES[mimeType.split(";")[0].trim().toLowerCase()];
  await openCopy(url, `${documentId}${type?.extension ?? ""}`, { headers, share: { mimeType, UTI: type?.UTI } });
}

/** The same for a file on a signed link, which needs no sign-in. The extension tells the viewer what it is. */
export async function openAttachmentFile(url: string, file: { id: string; filename: string; content_type: string }): Promise<void> {
  const extension = /\.[a-z0-9]{1,8}$/i.exec(file.filename)?.[0] ?? "";
  await openCopy(url, `${file.id}${extension}`, { share: { mimeType: file.content_type } });
}

/** A report the server builds on request, a PDF or a CSV by its name. It's removed once shared. */
export async function shareExportFile(url: string, fileName: string, headers: Record<string, string>): Promise<void> {
  const isCsv = fileName.toLowerCase().endsWith(".csv");
  await openCopy(url, fileName, { headers, share: isCsv ? { mimeType: CSV_MIME_TYPE, UTI: CSV_UTI } : { mimeType: PDF_MIME_TYPE, UTI: PDF_UTI } });
}

async function openCopy(url: string, fileName: string, options: ShareDownloadOptions): Promise<void> {
  const directory = documentFiles();
  directory.create({ idempotent: true, intermediates: true });
  await shareDownloadedFile(url, new File(directory, fileName), options);
}

/** For a copy left behind when the app was killed while one was open. */
export function clearDocumentFiles(): void {
  clearDownloadCopies(documentFiles());
}
