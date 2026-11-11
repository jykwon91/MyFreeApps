import type { DraftLine } from "./draft-line";

/** A block of the draft preview: a heading, a paragraph, or a bulleted list. */
export type DraftBlock =
  | { kind: "heading"; level: 1 | 2 | 3; line: DraftLine }
  | { kind: "paragraph"; line: DraftLine }
  | { kind: "list"; items: DraftLine[] };
