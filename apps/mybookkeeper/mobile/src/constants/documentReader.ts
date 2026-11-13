import { DOCUMENT_UPLOAD_MAX_LABEL } from "@mybookkeeper/api-client/constants/documentUpload";
import type { DocumentReaderMessages } from "../types/DocumentReaderMessages";
import type { DocumentReaderWording } from "../types/DocumentReaderWording";

/** What the document readers accept, matching the website. */
export const DOCUMENT_READER_FILE_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];

export function documentReaderMessages({ title, hint, takePhoto, target }: DocumentReaderWording): DocumentReaderMessages {
  return {
    title,
    hint,
    takePhoto,
    fromLibrary: "Use a document I've already uploaded",
    librarySheetTitle: "Pick a document to read",
    libraryEmpty: "You haven't uploaded any documents yet.",
    libraryLoading: "Loading your documents",
    libraryFailed: "I couldn't load your documents. Check your connection and try again.",
    libraryRetry: "Try again",
    untitled: "Untitled document",
    reading: "Reading...",
    tryAgain: "Try reading it again",
    neverMind: "Never mind",
    readDone: (name: string) => `I read ${name}. Check each figure before you save.`,
    tooBig: `That file's too big for me. I can take up to ${DOCUMENT_UPLOAD_MAX_LABEL}, so try a smaller scan or a lower resolution photo.`,
    wrongType: "I can't read that kind of file. A PDF or a photo (JPG, PNG or WEBP) works best.",
    tooMany: `That's as many documents as I can read today. Try again tomorrow, or fill in the ${target} by hand.`,
    unreadable: `I couldn't read that one. Try another file, or fill in the ${target} by hand.`,
    gone: "I can't find that document anymore. Try another one.",
    viewOnly: "You have view-only access, so I can't read documents for you.",
    storageDown: `I can't store files right now. Try again in a little while, or fill in the ${target} by hand.`,
    lostConnection: "I couldn't reach the server. Check your connection and try again.",
    somethingWrong: `Something went wrong on my end. Try again, or fill in the ${target} by hand.`,
    confidence: {
      high: "I read these straight off the document.",
      medium: "Some of these I had to interpret, so it's worth a look before you save.",
      low: "I wasn't very sure about this one. Please check every field.",
    },
    otherTerms: "Other terms from the document",
    myNotes: "My notes on this document",
    moreSummary: (terms: number, hasNotes: boolean): string => {
      const found = `I noticed ${terms} more term${terms === 1 ? "" : "s"} on the document`;
      if (terms > 0 && hasNotes) return `${found}, plus some notes I jotted down.`;
      if (terms > 0) return `${found}.`;
      return "I also jotted down some notes about this document.";
    },
  };
}

export const DOCUMENT_LIBRARY_SKELETON_ROWS: readonly number[] = [0, 1, 2, 3, 4];
