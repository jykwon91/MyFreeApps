/**
 * Discriminated union for what the DocumentViewer body should render at any
 * given moment. Replaces a chain of nested ternaries with a single switch.
 */
export type DocumentViewMode =
  | "payment"
  | "loading"
  | "error"
  | "empty"
  | "image"
  | "pdf"
  | "generic";
