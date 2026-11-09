import type { FileForUpload } from "./FileForUpload";

/** The two ways a document gets read: one just picked, or one already in the library. */
export interface DocumentReaders<TDraft> {
  fromFile: (file: FileForUpload) => Promise<TDraft>;
  fromLibrary: (documentId: string) => Promise<TDraft>;
}
