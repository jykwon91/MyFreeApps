/** "stale" keeps the last rows on screen after a reload fails; "error" has none to keep. */
export type ReplyTemplatesLoadMode = "loading" | "error" | "stale" | "empty" | "list";
