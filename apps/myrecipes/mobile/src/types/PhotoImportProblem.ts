export interface PhotoImportProblem {
  message: string;
  /** Camera access was refused, which only Settings can now change. */
  needsSettings?: boolean;
}
