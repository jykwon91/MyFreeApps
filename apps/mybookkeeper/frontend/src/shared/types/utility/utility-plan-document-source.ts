/**
 * What the utility-plan form is about to be read from.
 *
 * A file picked on the device is held here rather than uploaded on sight: an
 * abandoned dialog should leave nothing behind, and the read is one request
 * either way.
 */
export type UtilityPlanDocumentSource =
  | { kind: "library"; documentId: string; name: string }
  | { kind: "file"; file: File };
