/** What the phone's share sheet needs to open a stored document: its extension, and on iOS its type identifier. */
export interface DocumentFileType {
  extension: string;
  UTI?: string;
}

export const DOCUMENT_FILE_TYPES: Readonly<Record<string, DocumentFileType>> = {
  "application/pdf": { extension: ".pdf", UTI: "com.adobe.pdf" },
  "application/msword": { extension: ".doc", UTI: "com.microsoft.word.doc" },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": { extension: ".docx", UTI: "org.openxmlformats.wordprocessingml.document" },
  "application/vnd.ms-excel": { extension: ".xls", UTI: "com.microsoft.excel.xls" },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": { extension: ".xlsx", UTI: "org.openxmlformats.spreadsheetml.sheet" },
  "text/csv": { extension: ".csv", UTI: "public.comma-separated-values-text" },
  "text/plain": { extension: ".txt", UTI: "public.plain-text" },
};
