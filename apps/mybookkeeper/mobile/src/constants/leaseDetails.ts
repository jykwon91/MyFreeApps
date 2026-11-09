export const LEASE_DETAIL_MESSAGES = {
  kindImported: "Imported",
  kindGenerated: "Made from templates",
  details: "Lease details",
  detailsHint: "Opens every value on this lease",
  detailsTitle: "Details",
  loadingDetails: "Loading this lease's details",
  noDetails: "No values are filled in on this lease.",
  viewDetails: "See what's filled in",
  noNotes: "No notes yet.",
  addNotes: "Add notes",
  editNotes: "Edit notes",
  notesTitle: "Notes",
  notesLabel: "Anything to remember about this lease",
  notesPlaceholder: "Points to follow up, signing details, and so on.",
  saveNotes: "Save notes",
  savingNotes: "Saving…",
  notesSaved: "Notes saved.",
  cancelNotes: "Cancel",
  addDocument: "Add a document",
  addDocumentHint: "Makes a file from one of your templates",
} as const;

export function madeOn(date: string): string {
  return `Made ${date}`;
}

export function signedOn(date: string): string {
  return `Signed ${date}`;
}

export function detailsCount(count: number): string {
  return `${count} ${count === 1 ? "value" : "values"}`;
}
