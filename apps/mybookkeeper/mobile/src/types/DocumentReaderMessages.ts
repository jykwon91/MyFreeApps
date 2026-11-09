export interface DocumentReaderMessages {
  title: string;
  hint: string;
  takePhoto: string;
  fromLibrary: string;
  librarySheetTitle: string;
  libraryEmpty: string;
  libraryLoading: string;
  libraryFailed: string;
  libraryRetry: string;
  untitled: string;
  reading: string;
  tryAgain: string;
  neverMind: string;
  readDone: (name: string) => string;
  tooBig: string;
  wrongType: string;
  tooMany: string;
  unreadable: string;
  gone: string;
  viewOnly: string;
  storageDown: string;
  lostConnection: string;
  somethingWrong: string;
  confidence: { high: string; medium: string; low: string };
  otherTerms: string;
  myNotes: string;
  moreSummary: (terms: number, hasNotes: boolean) => string;
}
