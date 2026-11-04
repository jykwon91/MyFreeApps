export const SCREENING_REPORT_DIRECTORY = "screening-reports";

export const SCREENING_MESSAGES = {
  nothingYet: "No screening yet.",
  needsMoreDetails: "I need a few more details before screening.",
  waitingOnReport: "Waiting on a report. Have it? Upload it.",
  needsConnection: "Screening needs a connection.",
  couldntCheck: "I couldn't check if screening is ready.",
  couldntLoadProviders: "I couldn't load the screening services.",
  tryAgain: "Try again",
  runAnother: "Run another check",
  upload: "Upload a result",
  uploadAnother: "Upload another result",
  opening: "Opening…",
  uploaded: "Saved the screening result.",
  uploadFailed: "I couldn't upload that. Want me to try again?",
  tooBig: "That file is too big. Try a smaller PDF or a lower-resolution photo.",
  badFile: "I can't read that kind of file. Use a PDF, JPEG, or PNG.",
  needsReason: "I need a reason for that outcome.",
  storageDown: "I couldn't save the file just now. Your report is still here, so try again in a bit.",
  cameraDenied: "I need camera access for that. You can turn it on in Settings.",
  pickFailed: "I couldn't get that file. Want me to try again?",
  discardTitle: "Discard this upload?",
  discard: "Discard",
  keepEditing: "Keep editing",
  sheetTitle: "Upload a screening result",
  chooseFile: "Choose a file",
  takePhoto: "Take a photo of a paper report",
  photoLibrary: "Photo library",
  chooseDifferentFile: "Choose a different file",
  outcome: "Outcome",
  reason: "Reason",
  reasonHint: "Used on the adverse action notice.",
  save: "Save result",
  saving: "Uploading…",
  cancel: "Cancel",
} as const;

export const SCREENING_REASON_MAX_LENGTH = 2000;

export const SCREENING_REPORT_FILE_TYPES = ["application/pdf", "image/jpeg", "image/png"];

export function openedProviderMessage(provider: string): string {
  return `I opened ${provider}. When the report is ready, upload it here.`;
}

export function couldntOpenProviderMessage(provider: string): string {
  return `I couldn't open ${provider}. Want me to try again?`;
}
