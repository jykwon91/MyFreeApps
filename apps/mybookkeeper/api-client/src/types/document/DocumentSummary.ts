/** How many documents the workspace has, from GET /documents/summary — counts, not the documents. */
export interface DocumentSummary {
  total: number;
  /** Still being read: processing or extracting. */
  in_progress: number;
  /** Failed or a duplicate. */
  needs_review: number;
}
