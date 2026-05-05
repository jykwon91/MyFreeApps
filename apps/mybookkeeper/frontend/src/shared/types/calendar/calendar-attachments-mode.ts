/**
 * Discriminated union for what CalendarEventAttachmentsSection attachment list renders.
 * Replaces a chain of nested ternaries with a single switch.
 */
export type CalendarAttachmentsMode = "loading" | "list" | "empty";
