/**
 * Discriminated union for what LinkedLeaseDocumentsBody should render.
 * Replaces a chain of nested ternaries with a single switch.
 */
export type LinkedLeaseDocumentsMode = "loading" | "empty" | "list";
