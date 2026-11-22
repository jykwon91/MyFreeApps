/** The words of the question asked before unsaved work is thrown away. */
export interface DiscardCopy {
  discardTitle: string;
  discardBody?: string;
  keepEditing: string;
  discard: string;
}
