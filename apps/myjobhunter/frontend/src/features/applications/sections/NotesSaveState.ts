/** Where the auto-saving notes are: nothing to save, in flight, saved, or failed with the server's reason. */
export type NotesSaveState =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "saved" }
  | { status: "error"; message: string };
