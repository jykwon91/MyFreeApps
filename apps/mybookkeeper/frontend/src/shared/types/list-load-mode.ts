/**
 * What a list page's body shows. ``error`` means the list has never loaded and
 * the page's LoadErrorAlert is the whole story, so the body renders nothing.
 */
export type ListLoadMode = "loading" | "error" | "empty" | "list";
