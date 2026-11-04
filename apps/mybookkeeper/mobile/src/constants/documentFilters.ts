export type DocumentFilter = "all" | "needsALook";

export const DOCUMENT_FILTERS: readonly { value: DocumentFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "needsALook", label: "Needs a look" },
];
