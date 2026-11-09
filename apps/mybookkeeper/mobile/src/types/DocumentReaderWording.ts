/** What differs between one document reader and another; the rest of the copy is shared. */
export interface DocumentReaderWording {
  title: string;
  hint: string;
  takePhoto: string;
  /** What is being filled in by hand when a document can't be read, like "loan". */
  target: string;
}
