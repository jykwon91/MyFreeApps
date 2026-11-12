/** A value a file imports from a relative path: what the module exports it as, and the name the file gives it. */
export type RelativeImport = { from: string; imported: string; local: string };
