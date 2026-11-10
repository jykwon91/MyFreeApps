export const HELD_UPLOAD_DIRECTORY = "held-uploads";
export const HELD_THUMBNAIL_SIZE = 56;

export const UPLOAD_MESSAGES = {
  notAllowed: "You have view-only access.",
  cameraDenied: "I need camera access for that. You can turn it on in Settings.",
  pickFailed: "I couldn't get that file. Want me to try again?",
  discardTitle: "Discard this upload?",
  discard: "Discard",
  keepEditing: "Keep editing",
  chooseFile: "Choose a file",
  chooseDifferentFile: "Choose a different file",
  photoLibrary: "Photo library",
  removeFile: "Remove",
} as const;

export function removeHeldFileLabel(name: string): string {
  return `Remove ${name}`;
}

export function preparingProgress(done: number, total: number): string {
  return `Preparing ${Math.min(done + 1, total)} of ${total}`;
}
