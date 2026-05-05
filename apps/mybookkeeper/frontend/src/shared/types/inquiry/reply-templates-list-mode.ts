/**
 * Discriminated union for what ReplyTemplatesManager's list section should
 * render. Replaces a chain of nested ternaries with a single switch.
 */
export type ReplyTemplatesListMode = "loading" | "empty" | "list";
