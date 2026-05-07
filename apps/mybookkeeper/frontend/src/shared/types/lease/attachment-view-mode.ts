/**
 * Discriminated union for what the AttachmentViewer body should render.
 * Replaces a chain of nested ternaries with a single switch.
 */
export type AttachmentViewMode = "pdf" | "image" | "docx" | "other" | "unavailable";
